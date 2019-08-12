const rbush = require("rbush");

/**
 * A database of entities, indexed by arbitrary object fields and spatial bounds
 *
 * A note on the conventions used here:
 *
 * The GameDB API may appear a bit awkward to those familiar with javascript idioms, but very familiar to those used to c/c++.
 * The reason for this is performance: GameDB never directly returns values, instead it populates a results array provided by the caller.
 * This allows use to minimize allocations, both internal and external, which in turn means we minimize invocations of the garbage collector.
 * In high performance scenarios like games with a large number of moving entities, where we need to make tens of thousands of queries per second,
 * garbage collector invocations create stutter and sudden massive performance drops, particularly if GameDB is being run in the main thread.
 *
 */
class GameDB {

  /**** PUBLIC METHODS *****/

  /**
   * Construct a new GameDB
   *
   * @param fieldsToIndex - the fields to index on entities inserted into the db, an array of field names
   *
   */
  constructor(fieldsToIndex) {
    this.fieldIndexes = {};
    this.fieldsToIndex = fieldsToIndex;
    this.fieldsToIndex.forEach(field => {
      this.fieldIndexes[field] = {};
    });
    this.byId = {};
    this.spatialIndex = rbush();

    // internal sets to be used for intermediary operations
    // allowing us to avoid unncesseary allocations / GC
    this.pool = {
      emptySet: new Set(), // a set that's always empty, sometimes used a reference when we need an empty set
      fields: [], // sub-results from multiple fields
      spatial: new Set(), // the result of a spatial search
      ids: new Set(), // the id set resulting from the intersecting all the sub-results
      resultReference: null // sometimes we can directly reference an index slice for our results, avoiding copying ids
    };
  }

  /**
   * Search the database for matching entities
   *
   * @param bounds - optional, the bounds to search within, of the form { minX, minY, maxX, maxY }
   * @param query - optional, the field query to perform on the object, of the form { field: value, field2: value2, ... }
   * @param results - an array to store the results in
   *
   * Note that this function doesn't return it's results, but instead populates an array that's been passed in by the caller.
   * This c-style return is a bit awkward to work with, but we do it for the same reason that it's done in c: to avoid allocations wherever possible.
   */
  search({ bounds, query }, results) {

    // clear our result and intermediate computation buffers / sets
    this._clearBuffer(results);
    this._clearPool();

    // perform spatial search if necessary
    if(bounds) {
      this._spatialSearch(bounds);
    }

    // perform field search if necessary
    if(query) {
      this._fieldSearch(query);
    }

    // if we're querying spatial and field indeces together
    // compute the interesection of their respective results
    if(bounds && query) {

      // only perform intersection if we got results from both spatial
      // and field indeces, otherwise skip to id resolution
      if(this.pool.fields.length > 0 && this.pool.spatial.size > 0) {

        // find the smallest result
        let smallestSet = this.pool.spatial; // start by assuming the spatial results are smallest
        let smallestIndex = -1; // sentinal for the spatial index
        for(let i = 0; i < this.pool.fields.length; i++) {
          let field = this.pool.fields[i];
          if(field.size < smallestSet.size) {
            smallestSet = field;
            smallestIndex = i;
          }
        }

        // compute the intersection, starting from the smallest set
        const setIterator = smallestSet.values(); // alloc?
        for(let id of setIterator) {
          let intersects = true;
          for(let i = -1; i < this.pool.fields.length; i++) {
            if(i === smallestIndex) {
              continue;
            }
            const compare = (i === -1 ? this.pool.spatial : this.pool.fields[i]);
            if(!compare.has(id)) {
              intersects = false;
              break;
            }
          }
          if(intersects) {
            this.pool.ids.add(id);
          }
        }
      }


    // if we're only performing a spatial search
    } else if (bounds) {

      // just set the result reference to the spatial results we already have
      // to avoid copying a bunch of ids into the result set since we don't need
      // to perform any additional intersections
      this.pool.resultReference = this.pool.spatial;


    // if we're only performing a field-index search
    } else if (query) {

      // if we only queried one field just set the result reference to the result
      // set for the field that we already have to avoid copying a bunch of ids into the
      // result set since we don't need to do additional intersections
      if(this.pool.fields.length === 1) {
        this.pool.resultReference = this.pool.fields[0];

      // otherwise, if we're querying across multiple field indeces, perform an intersection
      // and put the results in the result pool's id set
      //
      // in addition, if we didn't get any results, skip directly to id resolution
      } else if(this.pool.fields.length > 0) {

        // find the smallest result set
        let smallestSet = this.pool.fields[0]; // start by assuming it's the first field
        let smallestIndex = 0;
        for(let i = 1; i < this.pool.fields.length; i++) {
          const field = this.pool.fields[i];
          if(field.size < smallestSet.size) {
            smallestSet = field;
            smallestIndex = i;
          }
        }

        // perform the intersection starting from the smallest set
        const setIterator = smallestSet.values();
        for(let id of setIterator) {
          let intersects = true;
          for(let i = 0; i < this.pool.fields.length; i++) {
            if(i === smallestIndex) {
              continue;
            }
            const field = this.pool.fields[i];
            if(!field.has(id)) {
              intersects = false;
              break;
            }
          }
          if(intersects) {
            this.pool.ids.add(id);
          }
        }
      }

    }

    // resolve the result pool, populating the results buffer with entities
    this._resolve(results);
  }

  /**
   * Insert an entity into the database.
   *
   * @param entity - the entity to insert into the database
   *
   * Entities must have, at minimum:
   *   - a unique id field
   *   - a getSpatialHandle() method that returns a spatial handle of the form { minX, minY, maxX, maxY }
   *
   * They may also have any number of additional fields.
   * Any fields whose keys are matched by this DB's fieldsToIndex parameter will be indexed and searchable.
   *
   */
  insert(entity) {
    this._insertIntoIdIndex(entity);
    this._insertIntoFieldIndex(entity);
    this._insertIntoSpatialIndex(entity);
  }

  /**
   * Remove an entity from the database
   *
   * @param entity - the entity to remove
   */
  remove(entity) {
    delete this.byId[entity.id];
    this.fieldsToIndex.forEach(field => {
      const fieldIndex = this.fieldIndexes[field];
      const value = entity[field];
      this.fieldIndexes[field][value].delete(entity.id);
    });
    this._removeFromSpatialIndex(entity);
  }

  /**
   * Update the position of an entity already present in the database
   *
   * @param entity - the entity to move
   *
   */
  move(entity) {
    this._removeFromSpatialIndex(entity);
    this._insertIntoSpatialIndex(entity);
  }

  /**
   * Get all of the entities in the database
   */
  all() {
    return Object.values(this.byId); // alloc??
  }

  /**
   * Remove all entities and clean up all indeces
   */
  nuke() {
    this._clearSpatialIndex();
    this.byId = [];
    this.fieldIndexes = {};
    this.fieldsToIndex.forEach(field => {
      this.fieldIndexes[field] = {};
    });
  }


  /**** PRIVATE / INTERNAL METHODS ***/

  _clearBuffer(buffer) {
    buffer.length = 0;
  }

  _clearPool() {
    this.pool.spatial.clear();
    this.pool.fields.length = 0;
    this.pool.ids.clear();
    this.pool.resultReference = null;
  }

  _resolve(results) {
    const useResults = this.pool.resultReference || this.pool.ids;
    const idIterator = useResults.values();
    for(let id of idIterator) {
      results.push(this.byId[id]);
    }
  }

  _spatialSearch(bounds) {
    this.spatialIndex.search(bounds).forEach(entry => {
      this.pool.spatial.add(entry.id);
    });
  }

  _fieldSearch(query) {

    // get the fields to search
    const fields = Object.keys(query); // alloc?

    // collect references to slices in our indexes for all relevant fields
    for(let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // get the set of entities matching each field-value
      const value = query[field];
      const result = this.fieldIndexes[field][value] || this.pool.emptySet;

      // keep a reference to the slice of our index that corresponds to the results for this field
      this.pool.fields.push(result);
    };
  }

  _insertIntoIdIndex(entity) {
    this.byId[entity.id] = entity;
  }

  _insertIntoFieldIndex(entity) {
    this.fieldsToIndex.forEach(field => {
      const fieldIndex = this.fieldIndexes[field];
      if(!fieldIndex[entity[field]]) {
        fieldIndex[entity[field]] = new Set([entity.id]);
      } else {
        fieldIndex[entity[field]].add(entity.id);
      }
    });
  }

  _insertIntoSpatialIndex(entity) {
    this.spatialIndex.insert({ id: entity.id, ...entity.getSpatialHandle() }); // FIXME: alloc
  }

  _removeFromSpatialIndex(entity) {
    this.spatialIndex.remove(entity, (a, b) => a.id === b.id);
  }

  _clearSpatialIndex() {
    this.spatialIndex.clear();
  }
}

module.exports = GameDB;

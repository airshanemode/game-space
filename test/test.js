const uuid = require("uuid/v4");
const expect = require("expect.js");

const { GameSpace } = require("../src/index");

class TestEntity {
  constructor(x, y, size, type, color) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.type = type;
    this.color = color;
    this.id = uuid();
  }

  getSpatialHandle() {
    return {
      minX: this.x,
      minY: this.y,
      maxX: this.x + this.size,
      maxY: this.y + this.size
    };  
  }
}

describe("GameSpace", () => {

  let db = new GameSpace(["type", "color"]);

  const dogConfig = [0, 0, 5, "animal", "black"];
  const catConfig = [12, 13, 2, "animal", "white"];
  const treeConfig = [5, 5, 7, "plant", "green"];
  const flowerConfig = [7, 2, 2, "plant", "green"];

  let dog, cat, tree, flower;

  beforeEach(() => {
    db.nuke();

    dog = new TestEntity(...dogConfig);
    cat = new TestEntity(...catConfig);
    tree = new TestEntity(...treeConfig);
    flower = new TestEntity(...flowerConfig);
  });

  it("should insert items without error", () => {
    db.insert(dog);
    db.insert(cat);
    db.insert(tree);
    db.insert(flower);
  });

  it("should provide all items inserted when all() is called", () => {
    db.insert(dog);
    expect(db.all().length).to.be(1)
    expect(db.all().find(entry => entry.id === dog.id)).to.be.ok();
    db.insert(cat);
    expect(db.all().length).to.be(2);
    expect(db.all().find(entry => entry.id === dog.id)).to.be.ok();
    expect(db.all().find(entry => entry.id === cat.id)).to.be.ok();
  });

  it("should allow removal of items with remove()", () => {
    db.insert(dog);
    db.remove(dog);
    expect(db.all().length).to.be(0);
    db.insert(dog);
    db.insert(cat);
    db.remove(dog);
    expect(db.all().length).to.be(1);
    expect(db.all().find(entry => entry.id === cat.id)).to.be.ok();
  });

  it("should support querying by a single field index with search()", () => {
    db.insert(dog);
    db.insert(cat);
    db.insert(tree);
    db.insert(flower);

    const results = [];

    db.search({ query: { type: "animal" } }, results);
    expect(results.length).to.be(2);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();
    expect(results.find(entry => entry.id === cat.id)).to.be.ok();

    db.search({ query: { type: "plant" } }, results);
    expect(results.length).to.be(2);
    expect(results.find(entry => entry.id === tree.id)).to.be.ok();
    expect(results.find(entry => entry.id === flower.id)).to.be.ok();

    db.search({ query: { type: "fake" } }, results);
    expect(results.length).to.be(0);

    db.remove(dog);
    db.search({ query: { type: "animal" } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === cat.id)).to.be.ok();

    db.remove(cat);
    db.insert(dog);
    db.search({ query: { type: "animal" } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();
  });

  it("should support querying by multiple field indeces with search()", () => {
    db.insert(dog);
    db.insert(cat);
    db.insert(tree);
    db.insert(flower);

    const results = [];

    db.search({ query: { type: "animal", color: "black" } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();

    db.search({ query: { type: "plant", color: "green" } }, results);
    expect(results.length).to.be(2);
    expect(results.find(entry => entry.id === tree.id)).to.be.ok();
    expect(results.find(entry => entry.id === flower.id)).to.be.ok();

    db.search({ query: { type: "plant", color: "black" } }, results);
    expect(results.length).to.be(0);

    db.search({ query: { type: "animal", color: "red" } }, results);
    expect(results.length).to.be(0);

    db.search({ query: { type: "book", color: "red" } }, results);
    expect(results.length).to.be(0);

    db.remove(dog);
    db.search({ query: { type: "animal", color: "black" } }, results);
    expect(results.length).to.be(0);
  });

  it("should support querying by bounding box with search()", () => {
    db.insert(dog);
    db.insert(cat);
    db.insert(tree);
    db.insert(flower);

    const results = [];

    const upperLeft = db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3
    } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();

    dog.x = 4;
    db.move(dog);
    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3
    } }, results);
    expect(results.length).to.be(0);

    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 15,
      maxY: 3
    } }, results);
    expect(results.length).to.be(2);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();
    expect(results.find(entry => entry.id === flower.id)).to.be.ok();

    db.remove(dog);
    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 15,
      maxY: 3
    } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === flower.id)).to.be.ok();
  });

  it("should support querying by bounding box and field indeces with search()", () => {
    db.insert(dog);
    db.insert(cat);
    db.insert(tree);
    db.insert(flower);

    const results = [];

    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3
    }, query: { type: "animal" } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();

    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3
    }, query: { type: "animal", color: "black" } }, results);
    expect(results.length).to.be(1);
    expect(results.find(entry => entry.id === dog.id)).to.be.ok();

    db.search({ bounds: {
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3
    }, query: { type: "animal", color: "white" } }, results);
    expect(results.length).to.be(0);
  });

});

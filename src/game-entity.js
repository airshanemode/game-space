const uuid = require("uuid/v4");

/**
 * Reference implementation / base class for game entities
 */
class GameEntity {
  constructor(left, top, width, height) {
    this.x = left;
    this.y = top;
    this.width = width;
    this.height = height;
    this.id = uuid();
  }

  getSpatialHandle() {
    return {
      minX: this.x,
      minY: this.y,
      maxX: this.x + this.width,
      maxY: this.y + this.height
    }
  }
}

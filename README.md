# Motivation

GameSpace is a fast spatial database optimized for games with a large number of moving entities. It supports indexing and querying over combinations of arbitrary oject fields and spatial bounding boxes. It's an ideal backbone for *broad phase collision detection* systems.

Central to the design of GameSpace and it's API is the minimization of allocations - this allows for tens of thousands of queries per second while minimizing garbage collecor invocations and reducing game stutter.

# Installation

```bash
npm install game-space
```

# Usage

## Vision Culling

Often, you'll want to implement a camera system in a game that only renders objects that are within the view of a virtual "camera". We can do that easily with GameSpace.

```javascript
const { GameSpace, GameEntity } = require("game-space");

// create a basic enemy class with hp and attack
// Note that GameSpace provides the GameEntity base class to get you started,
// but you can easily write your own.
class Enemy extends GameEntity {
  constructor(hp, attack) {
    this.hp = hp;
  }
}

// create a basic 100 x 100 unit camera
const camera = new GameEntity({ top: 0, left: 0, width: 100, height: 100 });

// construct or gamespace db
const space = new GameSpace();

// create some enemies and insert them into the db
[
  { left: 10, top: 20, width: 10, height: 10, hp: 5, attack: 10 },
  { x: 100, y: 30, width: 10, height: 10, hp: 3, attack: 7 }
].map(enemy => new Enemeny(enemy)).forEach(enemy => {
  space.insert(enemy);
});

// create an array to hold results of subsequent queries
// this allows us to reduce allocations and keep GC stutter down
const visibleEntities = [];

// rendering / game loop, you really want to use requestAnimationFrame() here, but we're keeping things simple
while(true) {
  space.search({ bounds: camera.getSpatialHandle() }, visibleEntities);
  visibleEntities.forEach(entity => drawEntity(entity)); // you obviously need to implement drawEntity yourself
}
```

## Full API Docs

The full public API is documented in JSDoc comments in `/src/game-space.js`

# Developing

## Running tests

```bash
npm run test
```

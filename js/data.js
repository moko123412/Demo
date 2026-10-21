'use strict';
// Static game data: map constants, terrain, objects, species, staff.

const TW = 64, TH = 32;              // isometric tile size in world pixels
const MAP_W = 48, MAP_H = 48;
const DAY_SECONDS = 12;              // game seconds per in-game day
const DAYS_PER_MONTH = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ENTRANCE = { x: 24, y: MAP_H - 1 };
const START_MONEY = 60000;

const TERRAIN = {
  grass:      { name: 'Grass',            color: '#6fa64a', speck: ['#7db757', '#5e9440', '#86c060'], cost: 5 },
  savannah:   { name: 'Savannah Grass',   color: '#c4ad57', speck: ['#d4bf68', '#ad9645', '#8f9a45'], cost: 5 },
  dirt:       { name: 'Dirt',             color: '#8a6a45', speck: ['#9b7b54', '#76583a', '#a4865e'], cost: 5 },
  sand:       { name: 'Sand',             color: '#e0cc90', speck: ['#ecdba6', '#cfb97a', '#f2e4b8'], cost: 5 },
  rainforest: { name: 'Rainforest Floor', color: '#3f6b33', speck: ['#4e7c3d', '#325a28', '#5d6b2c'], cost: 8 },
  snow:       { name: 'Snow',             color: '#e9f0f5', speck: ['#ffffff', '#d4dfe8', '#f6fafc'], cost: 8 },
  water:      { name: 'Fresh Water',      color: '#3c7fc2', speck: ['#4b8fd3', '#336fae', '#5b9ddc'], cost: 15 },
};
const TERRAIN_ORDER = ['grass', 'savannah', 'dirt', 'sand', 'rainforest', 'snow', 'water'];
const PATH_COST = 10;

const FENCES = {
  1: { name: 'Chain Link Fence', cost: 20 },
  2: { name: 'Wooden Fence',     cost: 25 },
  3: { name: 'Stone Wall',       cost: 40 },
};

// cat: foliage | rock | shelter | toy | building | scenery
// Buildings and scenery must sit next to a path; guests use them from the path.
const OBJECTS = {
  acacia:    { cat: 'foliage', name: 'Acacia Tree',     cost: 60 },
  tallgrass: { cat: 'foliage', name: 'Elephant Grass',  cost: 15 },
  palm:      { cat: 'foliage', name: 'Palm Tree',       cost: 55 },
  bamboo:    { cat: 'foliage', name: 'Bamboo',          cost: 40 },
  fern:      { cat: 'foliage', name: 'Fern',            cost: 20 },
  pine:      { cat: 'foliage', name: 'Pine Tree',       cost: 50 },
  oak:       { cat: 'foliage', name: 'Oak Tree',        cost: 50 },
  bush:      { cat: 'foliage', name: 'Shrub',           cost: 20 },
  rock:      { cat: 'rock',    name: 'Boulder',         cost: 40 },
  icerock:   { cat: 'rock',    name: 'Ice Rock',        cost: 45 },
  rockcave:  { cat: 'shelter', name: 'Rock Cave',       cost: 500 },
  hut:       { cat: 'shelter', name: 'Thatched Shelter', cost: 400 },
  icecave:   { cat: 'shelter', name: 'Ice Cave',        cost: 500 },
  ball:      { cat: 'toy',     name: 'Big Ball',        cost: 150 },
  log:       { cat: 'toy',     name: 'Hollow Log',      cost: 120 },
  burger:    { cat: 'building', name: 'Burger Stand',   cost: 900, sells: 'food',  price: 4, icon: '🍔' },
  drinks:    { cat: 'building', name: 'Drink Stand',    cost: 700, sells: 'drink', price: 2, icon: '🥤' },
  icecream:  { cat: 'building', name: 'Ice Cream Cart', cost: 600, sells: 'treat', price: 3, icon: '🍦' },
  restroom:  { cat: 'building', name: 'Restroom',       cost: 800, serves: 'bladder', icon: '🚻' },
  bench:     { cat: 'building', name: 'Bench',          cost: 80,  serves: 'energy' },
  trash:     { cat: 'building', name: 'Trash Can',      cost: 50,  serves: 'trash' },
  flowers:   { cat: 'scenery',  name: 'Flower Bed',     cost: 40,  appeal: 1 },
  statue:    { cat: 'scenery',  name: 'Elephant Statue', cost: 350, appeal: 3 },
};

const DIETS = {
  meat:  { name: 'Meat',        color: '#b3443a' },
  hay:   { name: 'Hay',         color: '#d9c25a' },
  fish:  { name: 'Fish',        color: '#9fb4c4' },
  fruit: { name: 'Fruit & Veg', color: '#e08a2c' },
};

const SPECIES = {
  lion: {
    name: 'African Lion', plural: 'Lions', cost: 1500, appeal: 9, speed: 0.9, size: 1, diet: 'meat',
    terrain: { savannah: 0.7, dirt: 0.2, grass: 0.1 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.12,
    rock: 'rock', rockDensity: 0.04, shelter: 'rockcave', water: false, space: 14, group: [2, 6], compatible: [],
    play: 'roar', sound: 'ROAR!',
  },
  tiger: {
    name: 'Bengal Tiger', plural: 'Tigers', cost: 1800, appeal: 10, speed: 0.9, size: 1.05, diet: 'meat',
    terrain: { rainforest: 0.6, grass: 0.3, dirt: 0.1 }, foliage: ['bamboo', 'palm', 'fern'], foliageDensity: 0.15,
    rock: 'rock', rockDensity: 0.04, shelter: 'rockcave', water: true, space: 16, group: [1, 3], compatible: [],
    play: 'pounce', sound: 'GRRR!',
  },
  elephant: {
    name: 'African Elephant', plural: 'Elephants', cost: 3000, appeal: 10, speed: 0.55, size: 1.6, diet: 'hay',
    terrain: { savannah: 0.5, dirt: 0.4, grass: 0.1 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.08,
    rock: 'rock', rockDensity: 0.02, shelter: null, water: true, space: 28, group: [2, 8], compatible: ['zebra', 'giraffe'],
    play: 'trumpet', sound: 'PAWOO!',
  },
  giraffe: {
    name: 'Reticulated Giraffe', plural: 'Giraffes', cost: 2000, appeal: 8, speed: 0.8, size: 1.3, diet: 'hay',
    terrain: { savannah: 0.7, dirt: 0.3 }, foliage: ['acacia'], foliageDensity: 0.1,
    rock: null, rockDensity: 0, shelter: 'hut', water: false, space: 20, group: [2, 6], compatible: ['zebra', 'elephant'],
    play: 'neck', sound: '♪',
  },
  zebra: {
    name: 'Plains Zebra', plural: 'Zebras', cost: 900, appeal: 6, speed: 1.1, size: 0.9, diet: 'hay',
    terrain: { savannah: 0.8, grass: 0.2 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.1,
    rock: null, rockDensity: 0, shelter: null, water: true, space: 10, group: [3, 12], compatible: ['giraffe', 'elephant'],
    play: 'buck', sound: 'Hee-haw!',
  },
  gorilla: {
    name: 'Lowland Gorilla', plural: 'Gorillas', cost: 2200, appeal: 9, speed: 0.7, size: 1, diet: 'fruit',
    terrain: { rainforest: 0.8, grass: 0.2 }, foliage: ['palm', 'bamboo', 'fern'], foliageDensity: 0.25,
    rock: 'rock', rockDensity: 0.03, shelter: 'hut', water: false, space: 14, group: [3, 8], compatible: [],
    play: 'chest', sound: 'Thump thump!',
  },
  grizzly: {
    name: 'Grizzly Bear', plural: 'Grizzly Bears', cost: 1600, appeal: 8, speed: 0.75, size: 1.15, diet: 'fish',
    terrain: { grass: 0.5, dirt: 0.3, snow: 0.2 }, foliage: ['pine', 'bush'], foliageDensity: 0.15,
    rock: 'rock', rockDensity: 0.05, shelter: 'rockcave', water: true, space: 16, group: [1, 3], compatible: [],
    play: 'stand', sound: 'GROWL!',
  },
  penguin: {
    name: 'Emperor Penguin', plural: 'Penguins', cost: 700, appeal: 7, speed: 0.5, size: 0.75, diet: 'fish',
    terrain: { snow: 0.6, water: 0.4 }, foliage: [], foliageDensity: 0,
    rock: 'icerock', rockDensity: 0.06, shelter: 'icecave', water: true, swims: true, space: 5, group: [5, 20], compatible: [],
    play: 'slide', sound: 'Squawk!',
  },
};

const STAFF_TYPES = {
  keeper: { name: 'Zookeeper',          hire: 500, salary: 300 },
  maint:  { name: 'Maintenance Worker', hire: 300, salary: 200 },
};

const GUEST_NAMES = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn',
  'Maya', 'Noah', 'Lena', 'Omar', 'Ivy', 'Leo', 'Nina', 'Eli', 'Zoe', 'Ben', 'Ada', 'Max', 'Ruth', 'Theo',
  'Priya', 'Kenji', 'Sofia', 'Diego', 'Hana', 'Tom', 'Ella', 'Finn', 'Grace', 'Ravi', 'Lucy', 'Owen'];
const GUEST_LAST = ['Smith', 'Garcia', 'Chen', 'Patel', 'Nguyen', 'Brown', 'Kim', 'Lopez', 'Cohen', 'Ali',
  'Rossi', 'Novak', 'Silva', 'Jones', 'Okafor', 'Berg', 'Moreau', 'Tanaka'];
const ANIMAL_NAMES = ['Kito', 'Zuri', 'Asha', 'Bongo', 'Nala', 'Tembo', 'Juma', 'Pip', 'Mosi', 'Kesi', 'Tumi',
  'Rafi', 'Lulu', 'Duma', 'Sefu', 'Imani', 'Nuru', 'Bahati', 'Ziggy', 'Oscar', 'Pebble', 'Maple', 'Waddles',
  'Juniper', 'Hazel', 'Rocco', 'Sunny', 'Bramble', 'Kaya', 'Tali', 'Moja', 'Penny', 'Biscuit', 'Clover'];

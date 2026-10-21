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
  4: { name: 'Exhibit Gate',     cost: 80, gate: true },
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
  eucalyptus: { cat: 'foliage', name: 'Eucalyptus Tree', cost: 55 },
  cactus:    { cat: 'foliage', name: 'Saguaro Cactus',  cost: 35 },
  rock:      { cat: 'rock',    name: 'Boulder',         cost: 40 },
  icerock:   { cat: 'rock',    name: 'Ice Rock',        cost: 45 },
  rockcave:  { cat: 'shelter', name: 'Rock Cave',       size: 2, cost: 500 },
  hut:       { cat: 'shelter', name: 'Thatched Shelter', size: 2, cost: 400 },
  icecave:   { cat: 'shelter', name: 'Ice Cave',        size: 2, cost: 500 },
  ball:      { cat: 'toy',     name: 'Big Ball',        cost: 150 },
  log:       { cat: 'toy',     name: 'Hollow Log',      cost: 120 },
  // Guest facilities. `use` describes what a guest gets: need = the stat it satisfies,
  // restore = stat changes, price = default ticket/menu price, time = seconds spent.
  burger:    { cat: 'building', name: 'Burger Stand',    cost: 900,  upkeep: 40, icon: '🍔', use: { need: 'hunger', price: 4, time: 2, restore: { hunger: 100 }, carry: 'burger', thought: 'That burger was delicious!' } },
  pizza:     { cat: 'building', name: 'Pizza Parlor',    cost: 1100, upkeep: 50, icon: '🍕', use: { need: 'hunger', price: 5, time: 3, restore: { hunger: 100, happy: 3 }, carry: 'pizza', thought: 'Best pizza in town!' } },
  popcorn:   { cat: 'building', name: 'Popcorn Cart',    cost: 500,  upkeep: 20, icon: '🍿', use: { need: 'hunger', price: 2, time: 1.5, restore: { hunger: 35, fun: 5 }, carry: 'popcorn', thought: 'Mmm, fresh popcorn.' } },
  icecream:  { cat: 'building', name: 'Ice Cream Cart',  cost: 600,  upkeep: 25, icon: '🍦', use: { need: 'hunger', price: 3, time: 1.5, restore: { hunger: 35, thirst: 15, happy: 5 }, carry: 'icecream', thought: 'Ice cream! Best day ever.' } },
  drinks:    { cat: 'building', name: 'Drink Stand',     cost: 700,  upkeep: 30, icon: '🥤', use: { need: 'thirst', price: 2, time: 1.5, restore: { thirst: 100 }, carry: 'drink', thought: 'Ahh, refreshing!' } },
  coffee:    { cat: 'building', name: 'Coffee Kiosk',    cost: 800,  upkeep: 30, icon: '☕', use: { need: 'thirst', price: 3, time: 2, restore: { thirst: 60, energy: 35 }, carry: 'coffee', thought: 'Just what I needed. I feel awake again!' } },
  drinkfountain: { cat: 'building', name: 'Drinking Fountain', cost: 150, upkeep: 5, use: { need: 'thirst', price: 0, time: 1.5, restore: { thirst: 50 }, thought: 'Free water, nice!' } },
  restroom:  { cat: 'building', name: 'Restroom',        cost: 800,  upkeep: 30, icon: '🚻', use: { need: 'bladder', price: 0, time: 2.5, restore: { bladder: 100 }, thought: 'What a relief.' } },
  bench:     { cat: 'building', name: 'Bench',           cost: 80,   upkeep: 0,  use: { need: 'energy', price: 0, time: 6, sit: true, restore: { energy: 60 }, thought: 'Nice to sit down for a bit.' } },
  picnic:    { cat: 'building', name: 'Picnic Table',    cost: 220,  upkeep: 2,  use: { need: 'energy', price: 0, time: 8, sit: true, restore: { energy: 70, happy: 4 }, thought: 'A picnic with a view of the animals!' } },
  trash:     { cat: 'building', name: 'Trash Can',       cost: 50,   upkeep: 0 },
  giftshop:  { cat: 'building', name: 'Gift Shop',       size: 2, cost: 1500, upkeep: 60, icon: '🎁', use: { need: 'souvenir', price: 8, time: 3, restore: { happy: 8 }, thought: 'I bought a souvenir to remember today!' } },
  kiosk:     { cat: 'building', name: 'Info Kiosk',      cost: 400,  upkeep: 15, icon: 'ℹ️', use: { need: 'map', price: 1, time: 1.5, restore: { happy: 2 }, thought: 'With this map I can find everything.' } },
  donation:  { cat: 'building', name: 'Donation Box',    cost: 150,  upkeep: 0 },
  playground: { cat: 'ride', name: 'Playground',         size: 2, cost: 2000, upkeep: 30, kids: true, use: { need: 'fun', price: 0, time: 8, capacity: 10, restore: { fun: 55, energy: -10, happy: 6 }, thought: 'Wheee! The slide is so fast!' } },
  carousel:  { cat: 'ride', name: 'Animal Carousel',     size: 2, cost: 4000, upkeep: 80, use: { need: 'fun', price: 3, time: 8, capacity: 8, restore: { fun: 50, happy: 8 }, thought: 'I rode the giraffe on the carousel!' } },
  swings:    { cat: 'ride', name: 'Swing Ride',          size: 2, cost: 5000, upkeep: 100, use: { need: 'fun', price: 3, time: 8, capacity: 10, restore: { fun: 60, happy: 10 }, thought: 'I felt like I was flying!' } },
  ferris:    { cat: 'ride', name: 'Ferris Wheel',        size: 2, cost: 7000, upkeep: 120, use: { need: 'fun', price: 4, time: 12, capacity: 12, restore: { fun: 65, happy: 12 }, thought: 'You can see the whole zoo from the Ferris wheel!' } },
  flowers:   { cat: 'scenery',  name: 'Flower Bed',      cost: 40,  appeal: 1 },
  lamp:      { cat: 'scenery',  name: 'Lamp Post',       cost: 60,  appeal: 0.5, light: true },
  gardenfountain: { cat: 'scenery', name: 'Garden Fountain', cost: 600, appeal: 3 },
  statue:    { cat: 'scenery',  name: 'Elephant Statue', cost: 350, appeal: 3 },
};

const DIETS = {
  meat:  { name: 'Meat',        color: '#b3443a' },
  hay:   { name: 'Hay',         color: '#d9c25a' },
  fish:  { name: 'Fish',        color: '#9fb4c4' },
  fruit: { name: 'Fruit & Veg', color: '#e08a2c' },
  bamboo: { name: 'Bamboo Shoots', color: '#7fa344' },
};

const SPECIES = {
  lion: {
    name: 'African Lion', plural: 'Lions', cost: 1500, appeal: 9, speed: 0.9, size: 1, diet: 'meat',
    terrain: { savannah: 0.7, dirt: 0.2, grass: 0.1 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.12,
    rock: 'rock', rockDensity: 0.04, shelter: 'rockcave', water: false, space: 14, group: [2, 6], compatible: [],
    play: 'roar', sound: 'ROAR!',
  },
  tiger: {
    name: 'Bengal Tiger', plural: 'Tigers', cost: 1800, appeal: 10, speed: 0.9, size: 1.1, diet: 'meat',
    terrain: { rainforest: 0.6, grass: 0.3, dirt: 0.1 }, foliage: ['bamboo', 'palm', 'fern'], foliageDensity: 0.15,
    rock: 'rock', rockDensity: 0.04, shelter: 'rockcave', water: true, space: 16, group: [1, 3], compatible: [],
    play: 'pounce', sound: 'GRRR!',
  },
  elephant: {
    name: 'African Elephant', plural: 'Elephants', cost: 3000, appeal: 10, speed: 0.55, size: 1.85, diet: 'hay',
    terrain: { savannah: 0.5, dirt: 0.4, grass: 0.1 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.08,
    rock: 'rock', rockDensity: 0.02, shelter: null, water: true, space: 28, group: [2, 8], compatible: ['zebra', 'giraffe', 'rhino'],
    play: 'trumpet', sound: 'PAWOO!',
  },
  giraffe: {
    name: 'Reticulated Giraffe', plural: 'Giraffes', cost: 2000, appeal: 8, speed: 0.8, size: 1.45, diet: 'hay',
    terrain: { savannah: 0.7, dirt: 0.3 }, foliage: ['acacia'], foliageDensity: 0.1,
    rock: null, rockDensity: 0, shelter: 'hut', water: false, space: 20, group: [2, 6], compatible: ['zebra', 'elephant', 'rhino'],
    play: 'neck', sound: '♪',
  },
  zebra: {
    name: 'Plains Zebra', plural: 'Zebras', cost: 900, appeal: 6, speed: 1.1, size: 1, diet: 'hay',
    terrain: { savannah: 0.8, grass: 0.2 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.1,
    rock: null, rockDensity: 0, shelter: null, water: true, space: 10, group: [3, 12], compatible: ['giraffe', 'elephant', 'rhino'],
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
  cheetah: {
    name: 'Cheetah', plural: 'Cheetahs', cost: 1700, appeal: 9, speed: 1.4, size: 0.95, diet: 'meat',
    terrain: { savannah: 0.8, dirt: 0.2 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.08,
    rock: 'rock', rockDensity: 0.03, shelter: null, water: false, space: 18, group: [1, 4], compatible: [],
    play: 'pounce', sound: 'Chirp!',
  },
  rhino: {
    name: 'Black Rhinoceros', plural: 'Rhinos', cost: 2600, appeal: 9, speed: 0.6, size: 1.45, diet: 'hay',
    terrain: { savannah: 0.6, dirt: 0.4 }, foliage: ['acacia', 'tallgrass'], foliageDensity: 0.06,
    rock: null, rockDensity: 0, shelter: null, water: true, space: 24, group: [1, 4], compatible: ['zebra', 'giraffe', 'elephant'],
    play: 'charge', sound: 'Snort!',
  },
  hippo: {
    name: 'Hippopotamus', plural: 'Hippos', cost: 2400, appeal: 9, speed: 0.5, size: 1.45, diet: 'hay',
    terrain: { water: 0.4, dirt: 0.3, grass: 0.3 }, foliage: ['tallgrass', 'palm'], foliageDensity: 0.06,
    rock: null, rockDensity: 0, shelter: null, water: true, swims: true, space: 22, group: [2, 6], compatible: ['flamingo'],
    play: 'yawn', sound: 'HONK!',
  },
  flamingo: {
    name: 'Greater Flamingo', plural: 'Flamingos', cost: 600, appeal: 6, speed: 0.6, size: 0.85, diet: 'fish',
    terrain: { water: 0.4, sand: 0.3, grass: 0.3 }, foliage: ['tallgrass'], foliageDensity: 0.05,
    rock: null, rockDensity: 0, shelter: null, water: true, swims: true, space: 4, group: [6, 24], compatible: ['hippo'],
    play: 'flap', sound: 'Honk honk!',
  },
  polarbear: {
    name: 'Polar Bear', plural: 'Polar Bears', cost: 2500, appeal: 10, speed: 0.7, size: 1.35, diet: 'fish',
    terrain: { snow: 0.6, water: 0.4 }, foliage: [], foliageDensity: 0,
    rock: 'icerock', rockDensity: 0.05, shelter: 'icecave', water: true, swims: true, space: 20, group: [1, 3], compatible: [],
    play: 'stand', sound: 'ROAR!',
  },
  panda: {
    name: 'Giant Panda', plural: 'Giant Pandas', cost: 3500, appeal: 10, speed: 0.5, size: 1, diet: 'bamboo',
    terrain: { grass: 0.5, rainforest: 0.3, dirt: 0.2 }, foliage: ['bamboo', 'pine'], foliageDensity: 0.25,
    rock: 'rock', rockDensity: 0.03, shelter: 'rockcave', water: true, space: 16, group: [1, 2], compatible: [],
    play: 'roll', sound: 'Bleat!',
  },
  kangaroo: {
    name: 'Red Kangaroo', plural: 'Kangaroos', cost: 1100, appeal: 7, speed: 1.2, size: 1, diet: 'hay',
    terrain: { sand: 0.4, dirt: 0.3, grass: 0.3 }, foliage: ['eucalyptus', 'bush'], foliageDensity: 0.08,
    rock: 'rock', rockDensity: 0.02, shelter: null, water: false, space: 12, group: [3, 10], compatible: [],
    play: 'hop', sound: 'Boing!',
  },
  camel: {
    name: 'Dromedary Camel', plural: 'Camels', cost: 1200, appeal: 6, speed: 0.7, size: 1.2, diet: 'hay',
    terrain: { sand: 0.8, dirt: 0.2 }, foliage: ['cactus'], foliageDensity: 0.05,
    rock: 'rock', rockDensity: 0.03, shelter: 'hut', water: false, space: 16, group: [2, 6], compatible: [],
    play: 'spit', sound: 'Hrrmph!',
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

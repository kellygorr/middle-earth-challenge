// This file exports the Middle-earth map SVG as a string
// Import it as: import { middleEarthMapSvg } from './mapData';

import { readFileSync } from 'fs';
import { resolve } from 'path';

// For React Native, we need to use require with the asset
export const middleEarthMapSvg = require('../assets/maps/middle-earth-map.svg');

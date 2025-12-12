// Color definitions for SVG map layers
// These colors are applied when colorizeMap is enabled
// They work with both minimal and classic themes

export const layerColors = {
  legend: '#231f20', // Black for legend elements
  titles: '#2C1810', // Dark brown for place names
  trees: '#436e47ff', // Forest green for wooded areas
  mountains: '#51402bff', // Brown/tan for mountains
  streets: '#B8956A', // Sandy tan for roads/paths
  water: '#5B8FA3', // Blue for rivers and lakes
  coastline: '#2F4858', // Darker blue for ocean/coast
  Routes: '#C9302C', // Red for the journey route (Frodo's path)
} as const;

export type LayerName = keyof typeof layerColors;

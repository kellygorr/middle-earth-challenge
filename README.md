# Middle-earth Challenge

A fitness tracking app that maps your real-world walking and running distance onto the journey from Bag End to Mount Doom — 1,779 km (1,235 miles) across Middle-earth.

## Features

- **Interactive Map** — Pan and zoom across a detailed map of Middle-earth rendered with React Native Skia
- **Health Integration** — Syncs with Apple Health (iOS) and Health Connect (Android) to track your distance
- **8 Checkpoints** — Celebrate milestones at iconic locations: Bag End, Bree, Rivendell, Moria, Lothlórien, Rauros Falls, Minas Morgul, and Mount Doom
- **18 Trivia Stops** — Discover Lord of the Rings lore as you progress along the path
- **Multiple Saves** — Maintain up to 3 separate journeys
- **Themes** — Choose between Classic and Minimalist visual styles
- **Offline-First** — All data stored locally with SQLite

## Tech Stack

- React Native 0.83
- React Native Skia for map rendering
- Zustand for state management
- OP-SQLite for local persistence
- react-native-health / react-native-health-connect for fitness data

## Getting Started

### Prerequisites

- Node.js 20+
- Xcode 15+ (iOS)
- Android Studio (Android)

### Installation

```sh
npm install
cd ios && bundle install && bundle exec pod install && cd ..
```

### Running

```sh
npm start
npm run ios   # or npm run android
```

## Credits

- [Map SVG source](https://github.com/k1tesurfen/mapome)

## License

MIT

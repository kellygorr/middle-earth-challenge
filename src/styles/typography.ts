import { TextStyle } from 'react-native';

export interface Typography {
  title: TextStyle;
  subtitle: TextStyle;
  body: TextStyle;
  caption: TextStyle;
  button: TextStyle;
  label: TextStyle;
}

export const typography: Typography = {
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'left',
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'left',
  },
  button: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
};

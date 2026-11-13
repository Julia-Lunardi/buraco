import { Image, StyleSheet, View } from 'react-native';

// A 64 pt tile of soft grain and a few stray fibres in white and black at low alpha, so it
// works on the green and the blue table alike (generated, seamless; Julia's call, 13.11.2026).
const FELT = require('../../../assets/felt.png'); // Metro picks felt@3x.png

/** Just a touch of texture over the table colour: put it first inside the table's view. */
export default function FeltTexture() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={FELT} resizeMode="repeat" accessibilityIgnoresInvertColors
             style={{ width: '100%', height: '100%', opacity: 0.7 }} />
    </View>
  );
}

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { chordShape } from '../lib/chord-shapes';
import { songChords } from '../lib/guitar';
import { useTheme } from '../theme/theme';

export function ChordDiagrams({ content, tuning }: { content: string; tuning: string }) {
  const theme = useTheme();
  const chords = useMemo(() => songChords(content), [content]);
  if (!chords.length) return null;
  const standard = !tuning || /^(?:standard(?: tuning)?|E\s*A\s*D\s*G\s*B\s*E)$/i.test(tuning.trim());
  return <View style={s.section}>
    <Text style={[s.heading, { color: theme.text }]}>Chords</Text>
    <Text style={[s.hint, { color: theme.secondary }]}>{standard ? 'Standard tuning · frets relative to capo · × muted · ○ open' : 'Diagrams require standard tuning; this tab uses a different tuning.'}</Text>
    {standard && <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.row}>
      {chords.map(name => {
        const shape = chordShape(name);
        const pressed = shape?.frets.filter(fret => fret > 0) ?? [];
        const first = pressed.length && Math.max(...pressed) > 4 ? Math.min(...pressed) : shape?.barre?.fret && shape.barre.fret > 1 ? shape.barre.fret : 1;
        const label = shape ? `${name}. Low E to high E: ${shape.frets.map(fret => fret < 0 ? 'muted' : fret === 0 ? 'open' : `fret ${fret}`).join(', ')}.` : `${name}. Diagram unavailable.`;
        return <View key={name} accessible accessibilityLabel={label} style={s.chord}>
          <Text style={[s.name, { color: theme.text }]}>{name}</Text>
          {!shape ? <Text style={[s.unavailable, { color: theme.secondary }]}>Shape not{ '\n' }available</Text> : <View style={s.diagram}>
            {shape.frets.map((fret, index) => <Text key={`mark${index}`} style={[s.marker, { left: index * 12 - 6, color: theme.text }]}>{fret < 0 ? '×' : fret === 0 ? '○' : ''}</Text>)}
            {[0,1,2,3,4].map(fret => <View key={`fret${fret}`} style={{ position: 'absolute', left: 0, top: 20 + fret * 17, width: 61, height: fret === 0 && first === 1 ? 3 : 1, backgroundColor: theme.text }} />)}
            {[0,1,2,3,4,5].map(string => <View key={`string${string}`} style={{ position: 'absolute', left: string * 12, top: 20, width: 1, height: 69, backgroundColor: theme.text }} />)}
            {first > 1 && <Text style={[s.fretLabel, { color: theme.secondary }]}>{first}fr</Text>}
            {shape.barre && <View style={{ position: 'absolute', left: shape.barre.from * 12 - 3, top: 20 + (shape.barre.fret - first + 0.5) * 17 - 3, width: (shape.barre.to - shape.barre.from) * 12 + 7, height: 6, borderRadius: 3, backgroundColor: theme.text }} />}
            {shape.frets.map((fret, index) => fret > 0 && <View key={`dot${index}`} style={{ position: 'absolute', left: index * 12 - 4, top: 20 + (fret - first + 0.5) * 17 - 4, width: 9, height: 9, borderRadius: 5, backgroundColor: theme.text }} />)}
            {shape.fingers.map((finger, index) => <Text key={`finger${index}`} style={[s.finger, { left: index * 12 - 6, color: theme.secondary }]}>{finger || ''}</Text>)}
          </View>}
        </View>;
      })}
    </ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingBottom: 18 }, heading: { fontSize: 14, fontWeight: '800' }, hint: { fontSize: 10, lineHeight: 16, marginTop: 5 },
  row: { gap: 14, paddingTop: 18, paddingBottom: 8 }, chord: { width: 96, alignItems: 'center' }, name: { fontSize: 16, fontWeight: '800', marginBottom: 4 }, diagram: { width: 60, height: 112 },
  marker: { position: 'absolute', top: 0, width: 13, textAlign: 'center', fontSize: 13 }, finger: { position: 'absolute', top: 92, width: 13, textAlign: 'center', fontSize: 12 }, fretLabel: { position: 'absolute', left: 65, top: 21, fontSize: 11, width: 30 }, unavailable: { fontSize: 11, textAlign: 'center', paddingTop: 30, height: 112 },
});

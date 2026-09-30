import { useContext } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Slider } from '../components/Slider';
import { useAppStyles } from '../theme/styles';
import { AccentContext, colorAlpha, darkenColor } from '../theme/accent';
import { readableAccent, useTheme } from '../theme/theme';
import type { Profile, Values } from '../types/app';

type Props = {
  compact: boolean; canManage: boolean; profiles: Profile[]; selected?: Profile; selectedId: string;
  summary: string; values: Values; sliderTransition: number;
  onSave: () => void; onDelete: (profile: Profile) => void; onChoose: (profile: Profile) => void;
  onChooseCustom: () => void; onUpdate: (key: keyof Values, value: number) => void;
};

export function SoundscapePage({ compact, canManage, profiles, selected, selectedId, summary, values, sliderTransition, onSave, onDelete, onChoose, onChooseCustom, onUpdate }: Props) {
  const s = useAppStyles();
  const accent = useContext(AccentContext);
  const theme = useTheme();
  const accentText = readableAccent(accent, theme);
  const accentTheme = {
    text: { color: accentText },
    background: { backgroundColor: accent },
    backgroundBorder: { backgroundColor: accent, borderColor: accent },
    tint: { backgroundColor: colorAlpha(accent, 0.14) },
  };
  return (
            <ScrollView style={s.screen} showsVerticalScrollIndicator={false} contentContainerStyle={[s.page, !compact && s.pageDesktop]} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
          <View style={[s.record, accentTheme.background]}><View style={[s.recordRing, { borderColor: darkenColor(accent) }]} /><View style={[s.recordDot, { backgroundColor: darkenColor(accent), borderColor: accent }]} /></View>
          <View style={s.heroCopy}><Text style={s.overline}>ACTIVE PROFILE</Text><Text numberOfLines={1} style={s.heroTitle}>{selected?.name ?? 'Custom'}</Text><Text style={s.muted}>{summary}</Text></View>
          <View style={[s.live, accentTheme.tint]}><View style={[s.liveDot, accentTheme.background]} /><Text style={[s.liveText, accentTheme.text]}>LIVE</Text></View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Your sound profiles</Text>
            {canManage && selected ? (
              <Pressable onPress={() => onDelete(selected)} style={({ pressed }) => [s.deleteHeaderButton, pressed && s.pressed]}>
                <Text style={s.deleteHeaderText}>Delete profile</Text>
              </Pressable>
            ) : canManage ? (
              <Pressable onPress={onSave} style={({ pressed }) => [s.saveHeaderButton, accentTheme.backgroundBorder, pressed && s.pressed]}>
                <Text style={s.saveHeaderText}>Save profile</Text>
              </Pressable>
            ) : <View style={s.guestBadge}><Text style={s.guestBadgeText}>LOG IN TO MANAGE</Text></View>}
          </View>
          {profiles.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
              {profiles.map(profile => {
                const active = selectedId === profile.id;
                return (
                  <View key={profile.id} style={[s.preset, active && s.presetActive, active && accentTheme.backgroundBorder]}>
                    <Pressable onPress={() => onChoose(profile)} style={s.presetName}>
                      <Text style={[s.presetText, active && s.presetTextActive]}>{active ? '✓  ' : ''}{profile.name}</Text>
                    </Pressable>
                  </View>
                );
              })}
              <Pressable onPress={onChooseCustom} style={[s.preset, selectedId === 'custom' && s.presetActive, selectedId === 'custom' && accentTheme.backgroundBorder, s.customPreset]}>
                <Text style={[s.presetText, selectedId === 'custom' && s.presetTextActive]}>{selectedId === 'custom' ? '✓  ' : ''}Custom</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <Pressable onPress={onChooseCustom} style={[s.preset, s.presetActive, accentTheme.backgroundBorder, s.customPreset]}><Text style={[s.presetText, s.presetTextActive]}>✓  Custom</Text></Pressable>
          )}
        </View>

        <View style={s.panel}>
          <View style={s.panelHead}>
            <View><Text style={s.sectionTitle}>Tone controls</Text><Text style={s.helper}>Drag to fine-tune your sound</Text></View>
            {selectedId === 'custom' && <View style={[s.customPill, accentTheme.tint]}><Text style={[s.customText, accentTheme.text]}>CUSTOM</Text></View>}
          </View>
          <Slider label="Bass" value={values.bass} onChange={v => onUpdate('bass', v)} transition={sliderTransition} />
          <Slider label="Midrange" value={values.mid} onChange={v => onUpdate('mid', v)} transition={sliderTransition} />
          <Slider label="Treble" value={values.treble} onChange={v => onUpdate('treble', v)} transition={sliderTransition} />
          <Slider label="Ambience" value={values.ambience} onChange={v => onUpdate('ambience', v)} transition={sliderTransition} />
        </View>

        <View style={s.panel}>
          <View style={s.outputHead}><View><Text style={s.sectionTitle}>Output level</Text><Text style={s.helper}>Overall profile gain</Text></View></View>
          <Slider label="Gain" value={values.gain} onChange={v => onUpdate('gain', v)} transition={sliderTransition} />
        </View>
        <Text style={s.footer}>Changes apply instantly to your turntable output.</Text>
            </ScrollView>
  );
}

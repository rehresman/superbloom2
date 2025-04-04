import { useState } from "react";
import { Piano, KeyboardShortcuts, MidiNumbers } from "react-piano";
import "react-piano/dist/styles.css";
import { useSynth } from "../hooks/useSynth";
import { useMIDI } from "../hooks/useMIDI";
import ControlSlider from "./ControlSlider";
import { MIDI_CC_MAP } from "../hooks/useMIDI";  // Import from useMIDI

interface Controls {
  cutoff: number;
  resonance: number;
  drive: number;
  oscillatorMix: number;
  vibrato: number;
}

const VirtualMIDIController = () => {
  const { 
    startAudio,
    statusMessage: synthStatus,
    connectSocket,
    controlValues,
    convertMidiToSynthParams,
    controlChange,
  } = useSynth();

  const { midiOutput, statusMessage: midiStatus } = useMIDI({
    onNoteOn: () => {},
    onNoteOff: () => {},
    onControlChange: (cc: number, value: number) => {
      const controlName = MIDI_CC_MAP[cc as keyof typeof MIDI_CC_MAP];
      if (controlName) {
        controlChange(controlName, value, false);
      }
    },
  });

  const [audioStarted, setAudioStarted] = useState(false);
  const [channel] = useState(0); // MIDI channel 1 (zero-based)

  const handleNoteOn = (midiNumber: number) => {
    if (!audioStarted) {
      setAudioStarted(true);
      startAudio();
    }
    if (midiOutput) {
      midiOutput.send([0x90 + channel, midiNumber, 100]); // Note On
    }
  };

  const handleNoteOff = (midiNumber: number) => {
    if (midiOutput) {
      midiOutput.send([0x80 + channel, midiNumber, 0]); // Note Off
    }
  };

  const handleControlChange = (controlName: keyof Controls, value: number) => {
    const ccNumber = Object.entries(MIDI_CC_MAP).find(([_, name]) => name === controlName)?.[0];
    if (ccNumber && midiOutput) {
      midiOutput.send([0xB0 + channel, parseInt(ccNumber), value]); // Send MIDI
      controlChange(controlName, value, true); // Update synth
    }
  };

  const firstNote = MidiNumbers.fromNote("c3");
  const lastNote = MidiNumbers.fromNote("f5");
  const keyboardShortcuts = KeyboardShortcuts.create({
    firstNote,
    lastNote,
    keyboardConfig: KeyboardShortcuts.HOME_ROW,
  });

  const synthParams = convertMidiToSynthParams(controlValues);

  return (
    <div>
      <h2>Synth Piano</h2>
      <p>Status: {synthStatus}</p>
      <p>MIDI Status: {midiStatus}</p>
      {!audioStarted && (
        <button
          onClick={() => {
            setAudioStarted(true);
            startAudio();
          }}
        >
          Click to Enable Audio
        </button>
      )}
      <div>
        <ControlSlider
          name="Cutoff"
          value={controlValues.cutoff}
          onChange={(value) => handleControlChange("cutoff", value)}
          min={20}
          max={12000}
          scale="exponential"
          midiValue={controlValues.cutoff}
        />
        <ControlSlider
          name="Resonance"
          value={controlValues.resonance}
          onChange={(value) => handleControlChange("resonance", value)}
          midiValue={controlValues.resonance}
        />
        <ControlSlider
          name="Drive"
          value={controlValues.drive}
          onChange={(value) => handleControlChange("drive", value)}
          midiValue={controlValues.drive}
        />
        <ControlSlider
          name="Oscillator Mix"
          value={controlValues.oscillatorMix}
          onChange={(value) => handleControlChange("oscillatorMix", value)}
          midiValue={controlValues.oscillatorMix}
        />
        <ControlSlider
          name="Vibrato"
          value={controlValues.vibrato}
          onChange={(value) => handleControlChange("vibrato", value)}
          midiValue={controlValues.vibrato}
        />
      </div>
      <Piano
        noteRange={{ first: firstNote, last: lastNote }}
        playNote={handleNoteOn}
        stopNote={handleNoteOff}
        width={600}
        keyboardShortcuts={keyboardShortcuts}
      />
      <button onClick={connectSocket}>connect socket</button>
    </div>
  );
};

export default VirtualMIDIController;

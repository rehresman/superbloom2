import { useState } from "react";
import { Piano, KeyboardShortcuts, MidiNumbers } from "react-piano";
import "react-piano/dist/styles.css";
import { useMIDI } from "../hooks/useMIDI";
import { useSocket } from "../hooks/useSocket";
import { useAudioEngine } from "../hooks/useAudioEngine";
import ControlSlider from "./ControlSlider";

const VirtualMIDIController = () => {
  const [audioStarted, setAudioStarted] = useState(false);

  const audioEngine = useAudioEngine();
  const { connectSocket } = useSocket();

  const clearAllNotes = () => {
    // Send note off messages for all possible MIDI notes (0-127)
    for (let note = 0; note < 128; note++) {
      noteOff(note);
    }
  };

  const startAudioAndInit = async () => {
    const success = await audioEngine.startAudio();
    if (success) {
      setAudioStarted(true);
      clearAllNotes();
    }
    return success;
  };

  const { 
    statusMessage,
    noteOn,
    noteOff,
    handleControlChange,
  } = useMIDI(audioEngine, startAudioAndInit);

  const handleNoteOn = (midiNumber: number) => {
    if (!audioStarted) {
      setAudioStarted(true);
      startAudioAndInit();
    }
    noteOn(midiNumber, 100);
  };

  const handleNoteOff = (midiNumber: number) => {
    noteOff(midiNumber);
  };

  const firstNote = MidiNumbers.fromNote("c3");
  const lastNote = MidiNumbers.fromNote("f5");
  const keyboardShortcuts = KeyboardShortcuts.create({
    firstNote,
    lastNote,
    keyboardConfig: KeyboardShortcuts.HOME_ROW,
  });

  return (
    <div>
      <h2>Synth Piano</h2>
      <p>Status: {statusMessage}</p>
      {!audioStarted && (
        <button onClick={startAudioAndInit}>
          Click to Enable Audio
        </button>
      )}
      <div>
        <ControlSlider
          name="Cutoff"
          value={audioEngine.controlValues.cutoff}
          onChange={(value) => handleControlChange("cutoff", value)}
          min={20}
          max={12000}
          scale="exponential"
          midiValue={audioEngine.controlValues.cutoff}
        />
        <ControlSlider
          name="Resonance"
          value={audioEngine.controlValues.resonance}
          onChange={(value) => handleControlChange("resonance", value)}
          midiValue={audioEngine.controlValues.resonance}
        />
        <ControlSlider
          name="Drive"
          value={audioEngine.controlValues.drive}
          onChange={(value) => handleControlChange("drive", value)}
          midiValue={audioEngine.controlValues.drive}
        />
        <ControlSlider
          name="Oscillator Mix"
          value={audioEngine.controlValues.oscillatorMix}
          onChange={(value) => handleControlChange("oscillatorMix", value)}
          midiValue={audioEngine.controlValues.oscillatorMix}
        />
        <ControlSlider
          name="Vibrato"
          value={audioEngine.controlValues.vibrato}
          onChange={(value) => handleControlChange("vibrato", value)}
          midiValue={audioEngine.controlValues.vibrato}
        />
      </div>
      <Piano
        noteRange={{ first: firstNote, last: lastNote }}
        playNote={handleNoteOn}
        stopNote={handleNoteOff}
        width={600}
        keyboardShortcuts={keyboardShortcuts}
      />
      <div>
        <button onClick={connectSocket}>connect socket</button>
        <button onClick={clearAllNotes}>All Notes Off</button>
      </div>
    </div>
  );
};

export default VirtualMIDIController;

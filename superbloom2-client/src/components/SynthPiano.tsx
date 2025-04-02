import { useState, useEffect } from "react";
import { Piano, KeyboardShortcuts, MidiNumbers } from "react-piano";
import "react-piano/dist/styles.css";
import { useSynth } from "../hooks/useSynth";

const SynthPiano = () => {
  const {
    startAudio,
    noteOn,
    noteOff,
    updateControls,
    statusMessage,
    connectSocket,
  } = useSynth();
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);

  useEffect(() => {
    if (audioStarted && !audioInitialized) {
      startAudio();
      setAudioInitialized(true);
    }
  }, [audioStarted, audioInitialized, startAudio]);

  const handleNoteOn = (midiNumber: number) => {
    if (!audioStarted) {
      setAudioStarted(true);
    }
    noteOn(midiNumber, 100); // Default velocity of 100
  };

  const handleNoteOff = (midiNumber: number) => {
    noteOff(midiNumber);
  };

  const handleControlChange = (controlName, value) => {
    updateControls({ [controlName]: value });
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
        <button
          onClick={() => {
            setAudioStarted(true);
          }}
        >
          Click to Enable Audio
        </button>
      )}
      <div>
        <label>
          Cutoff:
          <input
            type="range"
            min="0"
            max="127"
            defaultValue="64"
            onChange={(e) =>
              handleControlChange("cutoff", parseInt(e.target.value, 10))
            }
          />
        </label>
        <label>
          Resonance:
          <input
            type="range"
            min="0"
            max="127"
            defaultValue="0"
            onChange={(e) =>
              handleControlChange("resonance", parseInt(e.target.value, 10))
            }
          />
        </label>
        <label>
          Drive:
          <input
            type="range"
            min="0"
            max="127"
            defaultValue="1"
            onChange={(e) =>
              handleControlChange("drive", parseInt(e.target.value, 10))
            }
          />
        </label>
        <label>
          Oscillator Mix:
          <input
            type="range"
            min="0"
            max="127"
            defaultValue="0"
            onChange={(e) =>
              handleControlChange("oscillatorMix", parseInt(e.target.value, 10))
            }
          />
        </label>
        <label>
          Vibrato:
          <input
            type="range"
            min="0"
            max="127"
            defaultValue="0"
            onChange={(e) =>
              handleControlChange("vibrato", parseInt(e.target.value, 10))
            }
          />
        </label>
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

export default SynthPiano;

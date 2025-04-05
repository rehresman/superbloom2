import { useState, useCallback, useRef, useEffect } from "react";
import { Frequency } from "tone";

// Add MIDI CC mapping
export const MIDI_CC_MAP = {
  1: "cutoff",      // CC 1 (modulation wheel) for cutoff
  74: "cutoff",     // CC 74 (filter cutoff) alternative
  71: "resonance",  // CC 71 (filter resonance)
  76: "drive",      // CC 76 (drive)
  77: "oscillatorMix", // CC 77 (osc mix)
  78: "vibrato"     // CC 78 (vibrato)
} as const;

type MIDIControlName = typeof MIDI_CC_MAP[keyof typeof MIDI_CC_MAP];

export function useMIDI(audioEngine?: any, startAudio?: () => Promise<boolean>) {
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const activeKeys = useRef<Set<number>>(new Set());
  const midiAccessRef = useRef<WebMidi.MIDIAccess | null>(null);
  const [midiOutput, setMidiOutput] = useState<WebMidi.MIDIOutput | null>(null);

  const noteOn = useCallback(async (note: number, velocity: number, emitMIDIEvent?: (event: any) => void) => {
    if (startAudio && audioEngine && !audioEngine.isAudioRunning) {
      const success = await startAudio();
      if (success) {
        const noteName = Frequency(note, "midi").toNote();
        activeKeys.current.add(note);
        audioEngine.triggerNote(noteName, velocity);
        if (emitMIDIEvent) {
          emitMIDIEvent({ type: "noteon", note, velocity });
        }
      }
    } else {
      const noteName = Frequency(note, "midi").toNote();
      activeKeys.current.add(note);
      audioEngine.triggerNote(noteName, velocity);
      if (emitMIDIEvent) {
        emitMIDIEvent({ type: "noteon", note, velocity });
      }
    }
  }, [audioEngine, startAudio]);

  const noteOff = useCallback((note: number, emitMIDIEvent?: (event: any) => void) => {
    const noteName = Frequency(note, "midi").toNote();
    activeKeys.current.delete(note);
    audioEngine?.releaseNote(noteName);

    if (emitMIDIEvent) {
      emitMIDIEvent({ type: "noteoff", note });
    }
  }, [audioEngine]);

  const handleControlChange = useCallback((controlName: MIDIControlName, value: number, emitMIDIEvent?: (event: any) => void) => {
    try {
      audioEngine?.updateControls({ [controlName]: value });

      if (emitMIDIEvent) {
        emitMIDIEvent({ type: "cc", control: controlName, value });
      }
    } catch (error) {
      console.error(`Error processing control change ${controlName}=${value}:`, error);
    }
  }, [audioEngine]);

  const createMIDIMessageHandler = useCallback(() => {
    return (event: WebMidi.MIDIMessageEvent) => {
      try {
        const [status, data1, data2] = event.data;
        const command = status & 0xf0;

        switch (command) {
          case 0x90: // Note On
            if (data2 > 0) {
              if (!activeKeys.current.has(data1)) {
                noteOn(data1, data2);
              }
            } else {
              noteOff(data1);
            }
            break;
          case 0x80: // Note Off
            noteOff(data1);
            break;
          case 0xb0: // Control Change
            const controlName = MIDI_CC_MAP[data1 as keyof typeof MIDI_CC_MAP];
            if (controlName) {
              handleControlChange(controlName, data2);
            }
            break;
        }
      } catch (error) {
        console.error('MIDI message handling error:', error);
      }
    };
  }, [noteOn, noteOff, handleControlChange]);

  const setupMIDI = useCallback(() => {
    if (!midiAccessRef.current && navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then((midiAccess: WebMidi.MIDIAccess) => {
          midiAccessRef.current = midiAccess;
          const inputs = midiAccess.inputs.values();
          const outputs = midiAccess.outputs.values();
          const devices: string[] = [];

          // Setup inputs
          for (let input of inputs) {
            input.onmidimessage = createMIDIMessageHandler();
            if (input.name) devices.push(`Input: ${input.name}`);
          }

          // Setup first available output
          for (let output of outputs) {
            if (output.name) {
              devices.push(`Output: ${output.name}`);
              setMidiOutput(output);
              break;
            }
          }

          setMidiDevices(devices);
          setStatusMessage(`Connected to ${devices.length} MIDI device(s)`);
        })
        .catch((error: Error) => {
          console.error("Could not access your MIDI devices:", error);
          setStatusMessage("Failed to access MIDI devices");
        });
    }
  }, [createMIDIMessageHandler]);

  // Initial setup
  useEffect(() => {
    setupMIDI();
  }, [setupMIDI]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (midiAccessRef.current) {
        const inputs = midiAccessRef.current.inputs.values();
        for (let input of inputs) {
          input.onmidimessage = null;
        }
      }
      activeKeys.current.clear();
    };
  }, []);

  return {
    setupMIDI,
    midiDevices,
    statusMessage,
    midiOutput,
    createMIDIMessageHandler,
    noteOn,
    noteOff,
    handleControlChange
  };
}

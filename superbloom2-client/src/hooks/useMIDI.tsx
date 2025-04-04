import { useState, useCallback, useRef, useEffect } from "react";

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

interface MIDIHandlers {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onControlChange: (controlName: MIDIControlName, value: number) => void;
}

export function useMIDI(handlers: MIDIHandlers) {
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const activeKeys = useRef<Set<number>>(new Set());
  const midiAccessRef = useRef<WebMidi.MIDIAccess | null>(null);
  const [midiOutput, setMidiOutput] = useState<WebMidi.MIDIOutput | null>(null);

  const handleMIDIMessage = useCallback((event: WebMidi.MIDIMessageEvent) => {
    try {
      const [status, data1, data2] = event.data;
      const command = status & 0xf0;

      switch (command) {
        case 0x90: // Note On
          if (data2 > 0) {
            if (!activeKeys.current.has(data1)) {
              activeKeys.current.add(data1);
              handlers.onNoteOn(data1, data2);
            }
          } else {
            activeKeys.current.delete(data1);
            handlers.onNoteOff(data1);
          }
          break;
        case 0x80: // Note Off
          activeKeys.current.delete(data1);
          handlers.onNoteOff(data1);
          break;
        case 0xb0: // Control Change
          const controlName = MIDI_CC_MAP[data1 as keyof typeof MIDI_CC_MAP];
          if (controlName) {
            handlers.onControlChange(controlName, data2);
          }
          break;
      }
    } catch (error) {
      console.error('MIDI message handling error:', error);
    }
  }, [handlers]);

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
            input.onmidimessage = handleMIDIMessage;
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
  }, [handleMIDIMessage]);

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
    midiOutput
  };
}

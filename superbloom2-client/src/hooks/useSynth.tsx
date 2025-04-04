import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioEngine } from "./useAudioEngine";
import * as Tone from "tone";
import io, { Socket } from "socket.io-client";
import { useMIDI } from "./useMIDI";

interface Controls {
  cutoff: number;
  resonance: number;
  drive: number;
  oscillatorMix: number;
  vibrato: number;
}

export function useSynth(initialControls: Partial<Controls> = {}) {
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [socket, setSocket] = useState<Socket | null>(null);
  
  const activeNotes = useRef<Map<number, { noteName: string; velocity: number }>>(new Map());
  const audioEngine = useAudioEngine();

  const startAudioAndInit = async () => {
    const success = await audioEngine.startAudio();
    if (success) {
      setStatusMessage("Audio started successfully!");
    } else {
      setStatusMessage("Failed to start audio.");
    }
    return success;
  };

  const connectSocket = useCallback(() => {
    if (!socket) {
      const newSocket = io("http://localhost:3000");
      setSocket(newSocket);
      console.log("Socket connected:", newSocket.id);
    }
  }, [socket]);

  const disconnectSocket = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      console.log("Socket disconnected");
    }
  }, [socket]);

  const noteOn = (note: number, velocity: number, isLocal = true) => {
    const noteName = Tone.Frequency(note, "midi").toNote();
    console.log(`noteOn called: ${noteName}, velocity: ${velocity}`);
    
    // Initialize audio if needed before playing note
    if (!audioEngine.isAudioRunning) {
      startAudioAndInit().then((success) => {
        if (success) {
          triggerNoteAfterInit(note, velocity, isLocal);
        }
      });
    } else {
      triggerNoteAfterInit(note, velocity, isLocal);
    }
  };

  const triggerNoteAfterInit = (note: number, velocity: number, isLocal: boolean) => {
    const noteName = Tone.Frequency(note, "midi").toNote();
    activeNotes.current.set(note, { noteName, velocity });
    audioEngine.triggerNote(noteName, velocity);

    if (isLocal && socket) {
      socket.emit("midi", { type: "noteon", note, velocity });
    }
  };

  const noteOff = (note: number, isLocal = true) => {
    if (activeNotes.current.has(note)) {
      const noteInfo = activeNotes.current.get(note);
      const noteName = noteInfo?.noteName;

      if (noteName) {
        audioEngine.releaseNote(noteName);
        activeNotes.current.delete(note);
      }

      if (isLocal && socket) {
        socket.emit("midi", { type: "noteoff", note });
      }
    }
  };

  const controlChange = (controlName: keyof Controls, value: number, isLocal = true) => {
    try {
      audioEngine.updateControls({ [controlName]: value });

      if (isLocal && socket) {
        socket.emit("midi", { type: "cc", control: controlName, value });
      }
    } catch (error) {
      console.error(`Error processing control change ${controlName}=${value}:`, error);
    }
  };

  const { setupMIDI, midiDevices, statusMessage: midiStatus } = useMIDI({
    onNoteOn: (note, velocity) => noteOn(note, velocity),
    onNoteOff: (note) => noteOff(note),
    onControlChange: (controlName, value) => controlChange(controlName, value)
  });

  useEffect(() => {
    setupMIDI();
  }, [setupMIDI]);

  return {
    startAudio: startAudioAndInit,
    noteOn,
    noteOff,
    controlChange, 
    connectSocket,
    disconnectSocket,
    socket,
    statusMessage: midiStatus,
    midiDevices,
    controlValues: audioEngine.controlValues,
    convertMidiToSynthParams: audioEngine.convertMidiToSynthParams,
  };
}

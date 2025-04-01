import React, { useEffect, useState } from "react";
import { Piano, KeyboardShortcuts, MidiNumbers } from "react-piano";
import "react-piano/dist/styles.css";
import * as Tone from "tone";
import io from "socket.io-client";

const socket = io("http://localhost:3000");
const firstNote = MidiNumbers.fromNote("c3");
const lastNote = MidiNumbers.fromNote("f5");
const keyboardShortcuts = KeyboardShortcuts.create({
  firstNote,
  lastNote,
  keyboardConfig: KeyboardShortcuts.HOME_ROW,
});

const SynthPiano = () => {
  const [synth, setSynth] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!synth) {
      const newSynth = new Tone.PolySynth(Tone.Synth).toDestination();
      setSynth(newSynth);
    }

    socket.on("connect", (z) => {
      setIsConnected(true);
    });
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("midi", (msg) => {
      if (msg.type === "noteon") {
        handleNoteOn(msg.note, msg.velocity, false);
      } else if (msg.type === "noteoff") {
        handleNoteOff(msg.note, false);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("midi");
    };
  }, [synth]);

  const handleNoteOn = (midiNote, velocity, isLocal = true) => {
    if (synth) {
      const noteName = Tone.Frequency(midiNote, "midi").toNote();
      synth.triggerAttack(noteName, Tone.now(), velocity / 127);
      if (isLocal && isConnected) {
        socket.emit("midi", { type: "noteon", note: midiNote, velocity });
      }
    }
  };

  const handleNoteOff = (midiNote, isLocal = true) => {
    if (synth) {
      const noteName = Tone.Frequency(midiNote, "midi").toNote();
      synth.triggerRelease(noteName, Tone.now());
      if (isLocal && isConnected) {
        socket.emit("midi", { type: "noteoff", note: midiNote });
      }
    }
  };

  return (
    <div>
      <h2>Synth Piano</h2>
      <Piano
        noteRange={{ first: firstNote, last: lastNote }}
        playNote={(midiNumber) => handleNoteOn(midiNumber, 100)}
        stopNote={(midiNumber) => handleNoteOff(midiNumber)}
        width={600}
        keyboardShortcuts={keyboardShortcuts}
      />
      <p>Status: {isConnected ? "Connected" : "Disconnected"}</p>
    </div>
  );
};

export default SynthPiano;

// src/components/games/PlayAgain.js
// "Play again" for every game, without every game knowing how.
//
// The room page provides this around whichever game is running:
//   start()  record this match, open (or join) the next one, and go there
//   rematch  { by, next } once another player has opened the next room
// The results cards (GameOver, and Hollow Manor's own) read it.
import { createContext, useContext } from "react";

export const PlayAgainContext = createContext(null);
export const usePlayAgain = () => useContext(PlayAgainContext);

// src/components/games/PlayAgain.js
// "Play again" for every game, without every game knowing how.
//
// The room page provides this around whichever game is running:
//   start()     record this match and say I'm ready to play again
//   notReady()  take it back
//   load()      fetch who's ready (the socket keeps it current after)
//   again       { members: [{ id, name, ready }] }
// When everyone still in the room is ready, the next match starts for all of
// them at once and the room page goes there. The results cards (GameOver,
// TogetherResults, Station 13's) show it through AgainPanel.
import { createContext, useContext } from "react";

export const PlayAgainContext = createContext(null);
export const usePlayAgain = () => useContext(PlayAgainContext);

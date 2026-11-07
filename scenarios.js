// To add a scenario: append an entry here AND raise the generate_series(0,4) bound in schema.sql's start_game.
// o: 'p' = the three players, 'pn' = players + "Nobody" (4 options; schema.sql treats scenario 0 as the 4-option one), or an array of 3 labels.
export const SC = [
  { t: 'The Stolen Key', i: '🗝️', o: 'pn', q: 'Who stole the hotel key? (Or did nobody?)', s: 'The Manager’s moustache is sweating. The key to Room ∞ has vanished.' },
  { t: 'The Last Elevator', i: '🛗', o: 'p', q: 'Who stays behind in the lobby?', s: 'The elevator fits two. The third gets a lifetime pass to the lobby, plus a fern.' },
  { t: 'Three Doors', i: '🚪', o: ['The Breathing Door', 'The Painting Of A Door', 'The Door Marked “NOT A DOOR”'], q: 'Which door do you open?', s: 'One door is the exit. The others are more hotel.' },
  { t: 'House Rules', i: '📜', o: ['Everyone Speaks In Rhyme', 'The Floor Is Lava', 'Compliments Are Illegal'], q: 'Which new house rule will the minibar ghost accept?', s: 'The ghost wants a rule. Any rule. Preferably before it gets emotional.' },
  { t: 'The Soup Fund', i: '🍲', o: 'p', q: 'Who receives all 100 gold coins?', s: 'The hotel has exactly 100 coins and zero concept of sharing.' },
];
export const NAPKIN = 'The Manager wrote the correct answer on a napkin, then ate the napkin. Match it to win as a group.';
export const optsFor = (sc, names) => sc.o === 'p' ? names : sc.o === 'pn' ? [...names, 'Nobody'] : sc.o;
const SRC = ['A bellhop with too many elbows', 'The minibar', 'A talking carpet', 'Your own left shoe', 'A suspicious lamp', 'The fern', 'A damp telephone', 'Someone’s grandmother, in the vents', 'A wise sandwich'];
// Same wording for honest and dishonest clues, so a clue alone never proves anything.
export const clueText = (c, ops, k) => `${SRC[k % SRC.length]} ${c.ck === 'not' ? `swears it is NOT “${ops[c.ci]}”` : `insists it is “${ops[c.ci]}”`}. (Sources can be wrong.)`;
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const NAMES = ['Gerald', 'Pickle', 'Madame Fog', 'Sir Spoon', 'Brenda?', 'Toast'];
export const WIN = ['The napkin matches! The Manager weeps with confusion.', 'Correct! The Manager eats a second napkin to celebrate.', 'You did it. Nobody knows how. Least of all you.'];
export const FAIL = ['Wrong! The Manager awards you a stern pat on the head.', 'Incorrect. The hotel quietly rearranges itself in disappointment.', 'Disaster! Somewhere a lamp is laughing.'];
export const NOC = 'No two of you agreed. The Manager flips a coin, loses it, and declares failure.';
export const VERDICT = ['Total catastrophe. The hotel is thrilled.', 'A mess. A charming mess.', 'Suspiciously competent.', 'Flawless. Somebody check you for napkins.'];

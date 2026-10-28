export const PERSONALITIES = [
  { name: "Skeptical Sam", trait: "doubts everyone, asks follow-up questions" },
  { name: "Quiet Quinn", trait: "gives minimal clues, observes before voting" },
  { name: "Chatty Charlie", trait: "talkative, shares extra observations" },
  {
    name: "Logical Lucy",
    trait: "methodical, compares clues for contradictions",
  },
  { name: "Nervous Ned", trait: "hesitant, sometimes changes votes" },
  { name: "Bold Bella", trait: "confident accusations, sometimes wrong" },
];

export function personalityForIndex(i: number) {
  return PERSONALITIES[i % PERSONALITIES.length];
}

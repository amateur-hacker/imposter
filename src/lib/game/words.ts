export const CATEGORIES: Record<string, string[]> = {
  Animals: [
    "Elephant",
    "Penguin",
    "Giraffe",
    "Kangaroo",
    "Dolphin",
    "Octopus",
    "Cheetah",
    "Flamingo",
  ],
  Food: [
    "Pizza",
    "Sushi",
    "Tacos",
    "Pancakes",
    "Burger",
    "Pasta",
    "Ice Cream",
    "Curry",
  ],
  Places: [
    "Paris",
    "Tokyo",
    "Beach",
    "Library",
    "Airport",
    "Museum",
    "Forest",
    "Hospital",
  ],
  Objects: [
    "Guitar",
    "Camera",
    "Bicycle",
    "Umbrella",
    "Clock",
    "Lamp",
    "Backpack",
    "Mirror",
  ],
  Jobs: [
    "Doctor",
    "Teacher",
    "Chef",
    "Pilot",
    "Artist",
    "Engineer",
    "Firefighter",
    "Detective",
  ],
};

export function randomWord(category?: string) {
  const cats = category ? [category] : Object.keys(CATEGORIES);
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const words = CATEGORIES[cat];
  const word = words[Math.floor(Math.random() * words.length)];
  return { category: cat, word };
}

export const ALL_CATEGORIES = Object.keys(CATEGORIES);

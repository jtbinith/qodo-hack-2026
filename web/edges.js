// Edge cases (wireframes 2D.4, 2D.5, 2D.13): what the sender and the receiver are told, which photos
// come back from a screen that left, and when a tab is too full to take more
const photos = (n) => (n === 1 ? 'a photo' : `${n} photos`);

// 2D.4: while a photo is on its way, the sender's line names the screen, with Stop
export const sendingLine = (device) => `${device} →`;
export const tookBack = (name, n) => `${name} took ${photos(n)} back`;

// 2D.5: my photos sitting on a screen that has left
export const comeBack = (prints, gone, me) => [...prints.values()].filter((p) => p.owner === me && p.anchor === gone).map((p) => p.pid);

// 2D.13: room for size more bytes within the cap
export const fits = (held, size, cap) => held + size <= cap;
export function memLine({ here, waiting, bytes }) {
  const gb = `${(bytes / 1e9).toFixed(1)} GB`;
  return {
    title: `This tab is nearly full. Save the ${here} you’ve got, then get the rest.`,
    sub: `Paused at ${here} of ${here + waiting} · ${gb}`,
    note: `Saving frees up room. The other ${waiting} carry on after.`,
  };
}

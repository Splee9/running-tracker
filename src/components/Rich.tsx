/**
 * Renders a string with **bold** markers as real <b> spans — avoids
 * dangerouslySetInnerHTML for the self-generated comparison copy.
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

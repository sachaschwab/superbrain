const JA_RUN = /([぀-ヿ一-鿿〜々ー]+(?:[/・][぀-ヿ一-鿿〜ー]+)*)/;

/** Text with Japanese snippets followed by their romaji (from the curriculum glossary). */
export function RomajiText({ text, glossary }: { text: string; glossary: Record<string, string> }) {
  return (
    <>
      {text.split(JA_RUN).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="ja">
            {part}
            {glossary[part] && <span className="ml-0.5 text-xs italic text-accent"> ({glossary[part]})</span>}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

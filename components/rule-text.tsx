/** Formatting only: preserve the author's words and label explicit rule sections. */
export function RuleText({ text, className = "" }: { text: string; className?: string }) {
  const sections = text.replace(/\r\n/g, "\n").split(/\n+|\s+(?=(?:Efeito|Custo|Duração|Gatilho|Remoção|Como remover|Nível\s+\d+)\s*:)/i).filter(s => s.trim());
  return <div className={`rule-prose ${className}`}>{sections.map((section, index) => {
    const match = section.match(/^(Efeito|Custo|Duração|Gatilho|Remoção|Como remover|Nível\s+\d+)\s*:\s*/i);
    return <p key={index}>{match ? <><strong>{match[1]}:</strong> {section.slice(match[0].length)}</> : section}</p>;
  })}</div>;
}

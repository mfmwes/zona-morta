// The five 4×4 painted atlases contain sixteen isolated objects each.
// The catalogue keeps names and mechanics independent from artwork.
export type ArtSheet = "weapons" | "clothing" | "provisions" | "care" | "extra";
export type ItemArtRef = { sheet: ArtSheet; cell: number; badge?: string };

const named = new Map<string, ItemArtRef>();
function register(sheet: ArtSheet, cell: number, names: string) {
  for (const name of names.split("|")) named.set(name.trim(), { sheet, cell });
}

register("weapons", 0, "Faca resistente|Canivete robusto|Faca pequena|Canivete simples");
register("weapons", 1, "Facão");
register("weapons", 2, "Machado de trabalho");
register("weapons", 3, "Martelo de obra|Martelo pequeno");
register("weapons", 4, "Pé de cabra");
register("weapons", 5, "Cano / bastão|Bastão telescópico|Cassetete curto");
register("care", 9, "Lanterna pesada");
register("weapons", 6, "Lança improvisada");
register("weapons", 7, "Estilingue");
register("weapons", 8, "Arco simples");
register("weapons", 9, "Besta leve");
register("weapons", 10, "Pistola|Pistola compacta|Arma de pressão");
register("weapons", 11, "Revólver");
register("weapons", 12, "Espingarda");
register("weapons", 13, "Carabina|Rifle de caça|Fuzil de patrulha");
register("weapons", 14, "Tampa resistente|Escudo improvisado");
register("weapons", 15, "Colete de proteção|Colete tático reforçado");

register("clothing", 0, "Jaqueta impermeável grossa|Traje de bombeiro|Capa de chuva leve");
register("clothing", 1, "Botas impermeáveis");
register("clothing", 2, "Luvas de trabalho");
register("clothing", 3, "Máscara de poeira");
register("clothing", 4, "Óculos de proteção");
register("clothing", 5, "Capacete de obra com viseira");
register("clothing", 6, "Roupa reforçada|Macacão industrial|Macacão de oficina|Uniforme de manutenção");
register("clothing", 0, "Colete refletivo");
register("extra", 13, "Roupa de trilha");
register("weapons", 15, "Uniforme de segurança");
register("clothing", 7, "Uniforme de saúde");
register("clothing", 8, "Mochila urbana|Mochila de trilha|Mochila cargueira");
register("clothing", 9, "Bolsa tiracolo");
register("clothing", 10, "Kit de ferramentas de trabalho|Peças (1 unidade)");
register("clothing", 11, "Chave inglesa|Alicate|Jogo de chaves|Chaves de boca");
register("clothing", 12, "Gazua improvisada|Corrente com cadeado");
register("clothing", 13, "Fita isolante|Fita resistente");
register("clothing", 14, "Corda curta");
register("clothing", 15, "Serra manual");

register("extra", 0, "Taco de beisebol");
register("extra", 1, "Pá curta|Pá dobrável");
register("extra", 2, "Enxada");
register("extra", 3, "Chave de fenda reforçada|Tesoura de resgate");
register("extra", 4, "Carrinho dobrável");
register("extra", 5, "Cobertor");
register("extra", 6, "Panela leve");
register("extra", 7, "Isqueiro|Sinalizador de mão");
register("extra", 8, "Apito");
register("extra", 9, "Espelho pequeno");
register("extra", 10, "Caderno e lápis");
register("care", 11, "Documento ou crachá");
register("care", 15, "Fotografias e cartas");
register("extra", 11, "Telefone descarregado");
register("extra", 12, "Tênis leves");
register("extra", 13, "Jaqueta grossa|Casaco acolchoado|Jaqueta de motociclista|Roupa seca sobressalente|Moletom escuro|Roupa térmica");
register("extra", 14, "Luvas descartáveis|Luvas de procedimento");
register("extra", 15, "Avental impermeável|Máscara e avental clínico");

register("care", 0, "Kit médico de campo|Bolsa de tratamento lacrada|Caixa clínica completa");
register("clothing", 9, "Kit de higiene");
register("care", 5, "Medicamentos (1 unidade)");
register("care", 1, "Gaze e ataduras|Curativo compressivo|Tala e faixa");
register("care", 2, "Estojo de antissepsia completo");
register("care", 3, "Solução de limpeza lacrada");
register("care", 3, "Soro fisiológico lacrado");
register("provisions", 1, "Filtro portátil");
register("care", 5, "Pastilhas de purificação");
register("care", 4, "Termômetro");
register("care", 5, "Analgésico genérico|Antitérmico genérico|Medicamento para alergia|Medicamento para enjoo");
register("care", 2, "Medicamento prescrito identificado");
register("care", 5, "Antibiótico prescrito");
register("care", 6, "Sachês de reidratação");
register("care", 7, "Máscara respiratória com filtro");
register("care", 8, "Rádio portátil|Rádio de carro");
register("care", 9, "Lanterna pequena|Lanterna frontal");
register("care", 10, "Binóculos");
register("care", 11, "Mapa de bairro");
register("care", 12, "Saco de dormir");
register("care", 13, "Fogareiro");
register("care", 14, "Combustível (1 unidade)");
register("care", 15, "Câmera com bateria");

register("provisions", 0, "Garrafa de água lacrada|Água de torneira sem verificação|Água (1 unidade)|Garrafa sem rótulo");
register("provisions", 2, "Pacote de quatro águas");
register("provisions", 5, "Bebida isotônica lacrada|Cerveja ou vinho");
register("provisions", 1, "Cantil de água verificada");
register("provisions", 2, "Galão vazio|Água de cisterna tratada|Galão de água lacrado|Água de chuva coletada");
register("provisions", 3, "Suco em caixa fechado|Leite de longa vida fechado");
register("provisions", 4, "Chá pronto fechado|Café pronto em recipiente");
register("provisions", 5, "Refrigerante lacrado|Bebida energética fechada");
register("provisions", 6, "Conserva em lata|Feijão pronto fechado|Sopa enlatada|Peixe em lata");
register("provisions", 7, "Pão embalado|Sanduíche pronto");
register("provisions", 8, "Fruta firme|Frutas variadas");
register("provisions", 9, "Verduras de horta|Raízes colhidas");
register("provisions", 10, "Macarrão seco");
register("provisions", 11, "Arroz cru|Farinha / mistura seca");
register("provisions", 12, "Aveia");
register("provisions", 15, "Leite em pó");
register("provisions", 12, "Barra de cereal|Pacote de bolachas|Nozes e sementes");
register("provisions", 13, "Carne seca embalada");
register("provisions", 14, "Chocolate fechado");
register("provisions", 15, "Refeição congelada|Ração de emergência|Comida (1 unidade)");

named.set("Munição (1 carga)", { sheet: "weapons", cell: 10, badge: "M" });
named.set("Munição de Pistola", { sheet: "weapons", cell: 10, badge: "P" });
named.set("Munição de Espingarda", { sheet: "weapons", cell: 12, badge: "12" });
named.set("Munição de Carabina", { sheet: "weapons", cell: 13, badge: "C" });
named.set("Munição de Flechas", { sheet: "weapons", cell: 8, badge: "F" });
named.set("Munição de Virotes", { sheet: "weapons", cell: 9, badge: "V" });
named.set("Munição de Chumbinhos", { sheet: "weapons", cell: 7, badge: "BB" });
named.set("Munição de Outra", { sheet: "weapons", cell: 11, badge: "?" });
named.set("Kit de pilhas", { sheet: "care", cell: 9, badge: "BAT" });
named.set("Sinalizador de mão", { sheet: "extra", cell: 7, badge: "SOS" });

export function explicitItemArtFor(name: string): ItemArtRef | undefined { return named.get(name); }

export function itemArtFor(name: string, category = ""): ItemArtRef {
  const exact = named.get(name);
  if (exact) return exact;
  const text = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const clues: [RegExp, ItemArtRef][] = [
    [/mochila|bolsa/, { sheet: "clothing", cell: 8 }],
    [/remedio|medic|curativo|kit medico/, { sheet: "care", cell: 0 }],
    [/pistola|revolver/, { sheet: "weapons", cell: 10 }],
    [/municao/, { sheet: "weapons", cell: 11, badge: "M" }],
    [/faca|canivete/, { sheet: "weapons", cell: 0 }],
    [/lanterna|luz/, { sheet: "care", cell: 9 }],
    [/agua|garrafa/, { sheet: "provisions", cell: 0 }],
    [/radio|comunic/, { sheet: "care", cell: 8 }],
  ];
  for (const [pattern, art] of clues) if (pattern.test(text)) return art;
  const fallback: Record<string, ItemArtRef> = {
    "Armas primárias": { sheet: "weapons", cell: 5 }, "Armas secundárias": { sheet: "weapons", cell: 0 },
    "Proteções": { sheet: "weapons", cell: 15 }, "Trajes e acessórios": { sheet: "extra", cell: 13 },
    "Ferramentas, acesso e reparo": { sheet: "clothing", cell: 10 },
    "Luz, comunicação e informação": { sheet: "care", cell: 8 },
    "Abrigo, transporte e mochilas": { sheet: "clothing", cell: 8 },
    "Alimentos": { sheet: "provisions", cell: 15 }, "Bebidas": { sheet: "provisions", cell: 0 },
    "Medicamentos e cuidado": { sheet: "care", cell: 0 }, "Munição": { sheet: "weapons", cell: 11, badge: "M" },
  };
  return fallback[category] ?? { sheet: "clothing", cell: 10 };
}

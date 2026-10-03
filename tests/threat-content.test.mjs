import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const content = JSON.parse(fs.readFileSync(new URL("../lib/content.json", import.meta.url), "utf8"));
const adversaries = content.adversaries;

test("catálogo-base de ameaças mantém a revisão operacional", () => {
  assert.equal(adversaries.length, 10);

  const infected = adversaries.filter(entry => entry.tags?.includes("Infectado"));
  assert.equal(infected.length, 7);
  for (const threat of infected) {
    assert.ok(threat.features.some(feature => feature.startsWith("Mordida") || feature.startsWith("Mordida na massa")));
  }

  const allFeatures = adversaries.flatMap(entry => entry.features);
  assert.equal(allFeatures.some(feature => /seção 5/i.test(feature)), false);
  assert.equal(allFeatures.some(feature => /\bAcuidade\b/i.test(feature)), false);

  const horde = adversaries.find(entry => entry.name === "MASSA DE INFECTADOS");
  assert.ok(horde?.intro.startsWith("Patamar 1 Horda."));

  const door = adversaries.find(entry => entry.name === "AMBIENTE: PORTA ALARMADA");
  assert.equal("attack" in door, false);
  assert.ok(door?.features[0].includes("Barulho a 5"));
});

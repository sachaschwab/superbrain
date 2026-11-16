// Usage: npm run validate:curriculum — checks data/curriculum/*.json after editing it.
import { loadCurriculum } from '../src/lib/curriculum';

try {
  const c = loadCurriculum();
  const words = c.lessons.reduce((n, l) => n + l.vocabularyTargets.length, 0);
  console.log(`✓ ${c.lessons.length} lessons, ${words} vocabulary items, all review links point to earlier lessons.`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

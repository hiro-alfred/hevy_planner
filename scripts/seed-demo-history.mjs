// Seeds a THROWAWAY database with a catalog and a workout history chosen to hit
// every branch of the suggested-loads feature at once.
//
// Why this is committed. Every screenshotted verification in this project so far
// has begun by hand-seeding a database, and each session has re-invented that
// seed — which is a standing reason not to bother running things. This makes the
// setup one command, in the same spirit as scripts/cdp-drive.mjs.
//
//   node -e "…create database hevy_loads…"          # a scratch database
//   DATABASE_URL=…/hevy_loads npx next start -p 3005 # boot builds the schema
//   SEED_DATABASE_URL=…/hevy_loads node scripts/seed-demo-history.mjs
//
// Run it AFTER the app has booted once against the database: the boot migration
// is what creates the tables this fills. It DELETES the catalog and the whole
// workout history first, so never point it at a database that matters.
import mysql from "mysql2/promise";

const URL = process.env.SEED_DATABASE_URL;
if (!URL) throw new Error("set SEED_DATABASE_URL");

const db = await mysql.createConnection(URL);
const NOW = "2026-08-11T00:00:00Z";

// ---- catalog -------------------------------------------------------------
// Barbell ranks first in the generator's equipment order, so every exercise
// that carries history below is the barbell option for its muscle group and is
// therefore the one the plan will pick.
const T = [
  // [id, title, type, primary, secondary[], equipment]
  ["bench", "Bench Press (Barbell)", "weight_reps", "chest", ["triceps", "shoulders"], "barbell"],
  ["row", "Bent Over Row (Barbell)", "weight_reps", "lats", ["upper_back", "biceps"], "barbell"],
  ["ohp", "Overhead Press (Barbell)", "weight_reps", "shoulders", ["triceps"], "barbell"],
  ["curl", "Biceps Curl (Barbell)", "weight_reps", "biceps", ["forearms"], "barbell"],
  ["squat", "Squat (Barbell)", "weight_reps", "quadriceps", ["glutes", "lower_back"], "barbell"],
  ["rdl", "Romanian Deadlift (Barbell)", "weight_reps", "hamstrings", ["glutes"], "barbell"],
  ["pullup", "Pull Up", "reps_only", "upper_back", ["lats", "biceps"], "none"],

  // No history: these fill the days out and show the untouched null path.
  ["skull", "Skullcrusher (Barbell)", "weight_reps", "triceps", ["chest"], "barbell"],
  ["hipthrust", "Hip Thrust (Barbell)", "weight_reps", "glutes", ["hamstrings"], "barbell"],
  ["calf", "Standing Calf Raise (Machine)", "weight_reps", "calves", [], "machine"],
  ["crunch", "Cable Crunch", "weight_reps", "abdominals", [], "machine"],
  ["incline", "Incline Bench Press (Dumbbell)", "weight_reps", "chest", ["shoulders"], "dumbbell"],
  ["pulldown", "Lat Pulldown (Cable)", "weight_reps", "lats", ["biceps"], "machine"],
  ["facepull", "Face Pull (Cable)", "weight_reps", "upper_back", ["shoulders"], "machine"],
  ["lateral", "Lateral Raise (Dumbbell)", "weight_reps", "shoulders", [], "dumbbell"],
  ["hammer", "Hammer Curl (Dumbbell)", "weight_reps", "biceps", ["forearms"], "dumbbell"],
  ["pushdown", "Triceps Pushdown (Cable)", "weight_reps", "triceps", [], "machine"],
  ["legpress", "Leg Press (Machine)", "weight_reps", "quadriceps", ["glutes"], "machine"],
  ["legcurl", "Leg Curl (Machine)", "weight_reps", "hamstrings", [], "machine"],
  ["gluteback", "Glute Kickback (Machine)", "weight_reps", "glutes", [], "machine"],
  ["seatedcalf", "Seated Calf Raise (Machine)", "weight_reps", "calves", [], "machine"],
  ["plank", "Plank", "duration", "abdominals", [], "none"],
  ["legraise", "Hanging Leg Raise", "reps_only", "abdominals", [], "none"],
  ["shrug", "Shrug (Barbell)", "weight_reps", "traps", ["upper_back"], "barbell"],
];

await db.query("delete from workout_sets");
await db.query("delete from workouts");
await db.query("delete from exercise_templates");

for (const [id, title, type, primary, secondary, equipment] of T) {
  await db.execute(
    `insert into exercise_templates
       (id, title, type, primary_muscle_group, secondary_muscle_groups, equipment_category, is_custom, fetched_at)
     values (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, title, type, primary, JSON.stringify(secondary), equipment, NOW],
  );
}

// ---- history -------------------------------------------------------------
// One entry per progression branch, so the plan page shows all of them at once.
const TITLES = Object.fromEntries(T.map(([id, title]) => [id, title]));

/** `sets` is [weightKg, reps] repeated `count` times. */
async function logged(id, startTime, weightKg, reps, count = 3) {
  const workoutId = `${id}-${startTime.slice(0, 10)}`;
  await db.execute(
    `insert into workouts (id, title, routine_id, start_time, end_time, hevy_updated_at, fetched_at)
     values (?, ?, null, ?, null, ?, ?)`,
    [workoutId, `Session ${startTime.slice(0, 10)}`, startTime, startTime, NOW],
  );
  for (let i = 0; i < count; i += 1) {
    await db.execute(
      `insert into workout_sets
         (workout_id, exercise_template_id, exercise_title, exercise_index, set_index, set_type,
          weight_kg, reps, rpe, duration_seconds, distance_meters)
       values (?, ?, ?, 0, ?, 'normal', ?, ?, null, null, null)`,
      [workoutId, id, TITLES[id], i, weightKg, reps],
    );
  }
}

// add_weight: every set at the top of 8-12 → 100 kg becomes 102.5 kg.
await logged("bench", "2026-08-09T09:00:00Z", 100, 12);
await logged("bench", "2026-08-02T09:00:00Z", 100, 10);

// add_reps: mid-range, so the load holds at 70 kg.
await logged("row", "2026-08-08T09:00:00Z", 70, 10);
await logged("row", "2026-08-01T09:00:00Z", 70, 9);

// layoff deload: nearly two months untrained → 45 kg becomes 40 kg.
await logged("ohp", "2026-06-20T09:00:00Z", 45, 10);
await logged("ohp", "2026-06-13T09:00:00Z", 45, 10);

// stall deload: three sessions, same weight, no extra reps → 100 kg becomes 90.
await logged("rdl", "2026-08-09T09:00:00Z", 100, 10);
await logged("rdl", "2026-08-02T09:00:00Z", 100, 10);
await logged("rdl", "2026-07-26T09:00:00Z", 100, 10);

// baseline: one session only → repeat 30 kg.
await logged("curl", "2026-08-09T09:00:00Z", 30, 10);

// NOT transferable: trained in fives, and the plan prescribes 8-12.
await logged("squat", "2026-08-07T09:00:00Z", 140, 5);
await logged("squat", "2026-07-31T09:00:00Z", 140, 5);

// History with no load at all: a suggestion needs a weight to suggest.
await logged("pullup", "2026-08-09T09:00:00Z", null, 8);
await logged("pullup", "2026-08-02T09:00:00Z", null, 7);

const [[counts]] = await db.query(
  "select (select count(*) from exercise_templates) as templates, (select count(*) from workouts) as workouts, (select count(*) from workout_sets) as sets",
);
console.log(counts);
await db.end();

import { main } from "./processor";

async function run() {
  try {
    await main(process.argv);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();

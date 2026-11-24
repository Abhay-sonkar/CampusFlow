# Running the tests

```bat
cd server
npm test               :: everything (about a minute)
npm run test:unit      :: only the fast tests, no database needed
npm run test:coverage  :: everything, plus a report of which lines the tests ran
```

Unit tests (`tests/unit`) check small pieces of logic on their own.
Integration tests (`tests/integration`) call the real API with Supertest against a throwaway MongoDB.

The first run downloads a MongoDB binary (about 100 to 200 MB) that is cached afterwards.
To use a MongoDB you already have instead (local, Docker, Atlas), set `TEST_MONGO_URI`:

```bat
set TEST_MONGO_URI=mongodb://127.0.0.1:27017
npm test
```

Each test file creates its own uniquely named database and deletes it at the end.
Your real `campusflow` database and your Redis are never touched.

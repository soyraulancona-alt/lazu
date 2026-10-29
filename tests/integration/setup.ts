// Se carga antes de las pruebas de integración: usan su propia base de datos.
const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error("Define DATABASE_URL_TEST (una base PostgreSQL de pruebas con las migraciones aplicadas).");
  process.exit(1);
}
process.env.DATABASE_URL = url;

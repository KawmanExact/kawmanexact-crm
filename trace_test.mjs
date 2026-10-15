const { withCountryCode, contactsToCsv, contactsToExcelCsv, CONTACT_CSV_COLUMNS } = require('./src/lib/contacts-csv');
const { parseCSV } = require('./src/lib/csv');

const contact = { phone: '914444212345', mobile: '918806329882' };
console.log('withCountryCode:', JSON.stringify(withCountryCode('914444212345')));
console.log('contactsToCsv:', JSON.stringify(contactsToCsv([contact])));
console.log('Full CSV:', contactsToCsv([contact]));
const csv = contactsToCsv([contact]);
const rows = parseCSV(csv);
console.log('Parsed Phone:', JSON.stringify(rows.rows[0].Phone));
console.log('Parsed Mobile:', JSON.stringify(rows.rows[0].Mobile));

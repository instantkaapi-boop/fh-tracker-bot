import 'dotenv/config';
import { checkIn, checkOut, missingCheckins, missingCheckouts } from '../lib/checkin.js';

console.log('checkIn(Fazil, 10:42):', await checkIn('Fazil', '10:42'));
console.log('checkIn(Fazil) again:', await checkIn('Fazil'));
console.log('missingCheckins():', await missingCheckins());
console.log('checkOut(Fazil, 18:15):', await checkOut('Fazil', '18:15'));
console.log('checkOut(Jishnu) (no check-in):', await checkOut('Jishnu'));
console.log('missingCheckouts():', await missingCheckouts());

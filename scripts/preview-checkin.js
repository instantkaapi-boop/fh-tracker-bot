import 'dotenv/config';
import { checkIn, checkOut, missingCheckins, missingCheckouts } from '../lib/checkin.js';

console.log('checkIn(Fazil):', await checkIn('Fazil'));
console.log('checkIn(Fazil) again:', await checkIn('Fazil'));
console.log('missingCheckins():', await missingCheckins());
console.log('checkOut(Fazil):', await checkOut('Fazil'));
console.log('checkOut(Jishnu) (no check-in):', await checkOut('Jishnu'));
console.log('missingCheckouts():', await missingCheckouts());

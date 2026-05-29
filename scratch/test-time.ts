import { toISTDate } from '../app/lib/ist-utils';
import { format } from 'date-fns';

const now = new Date();
console.log('system date string:', now.toString());
console.log('system iso string:', now.toISOString());
console.log('toISTDate result:', toISTDate(now).toString());
console.log('toISTDate iso string:', toISTDate(now).toISOString());
console.log('formatted string:', format(toISTDate(now), 'dd MMM yyyy, HH:mm') + ' IST');

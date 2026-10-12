import 'dotenv/config';
import { Resend } from 'resend';
import { writeFileSync } from 'node:fs';

const ID = 'ee11cd7e-48f3-4598-801d-f22cc34a5cba';


const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://192.168.100.63:3000';
const PUENTE = `${APP_PUBLIC_URL}/invitaciones/abrir`;

const resend = new Resend(process.env.RESEND_API_KEY_FULL ?? process.env.RESEND_API_KEY!);

const { data, error } = await resend.templates.get(ID);
if (error || !data) {
  console.error('get ERROR:', error?.message);
  process.exit(1);
}
let html: string = data.html ?? '';

let reemplazos = 0;
const antes = html;
html = html
  .split('ribani://invitaciones')
  .join(PUENTE);
if (html !== antes) reemplazos++;

console.log('reemplazos deep-link→puente:', reemplazos, '| puente:', PUENTE);
if (reemplazos === 0) {
  console.error('no encontré ninguno ribani://invitaciones; HTML guardado');
  writeFileSync('plantilla-actual.html', html);
  process.exit(1);
}

writeFileSync('plantilla-supervisor-invitation.html', html);

const up = await resend.templates.update(ID, {
  name: 'Supervisor Invitation',
  from: 'Invitaciones RIBANI <onboarding@resend.dev>',
  subject: 'Te invitaron a cuidar en RIBANI',
  html,
});
if (up.error) {
  console.error('update ERROR:', up.error.message);
  process.exit(1);
}

const pub = await resend.templates.publish(ID);
if (pub.error) {
  console.error('publish ERROR:', pub.error.message);
  process.exit(1);
}
console.log('plantilla actualizada y PUBLICADA, id:', pub.data?.id ?? up.data?.id);

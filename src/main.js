import { main } from './ui/app.js';

const root = document.getElementById('app');
root.textContent = ''; // remove the loading message
main(root).catch((e) => {
  console.error(e);
  root.textContent = '';
  const box = document.createElement('div');
  box.className = 'boot boot-error';
  box.setAttribute('role', 'alert');
  const title = document.createElement('b');
  title.textContent = 'პროგრამა ვერ ჩაირთო.';
  const msg = document.createElement('p');
  msg.textContent = `შეცდომა: ${e.message}. პროექტი ბრაუზერში შენახული რჩება — სცადე გვერდის გადატვირთვა.`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-accent';
  btn.textContent = 'გადატვირთვა';
  btn.addEventListener('click', () => location.reload());
  box.append(title, msg, btn);
  root.append(box);
});

import { main } from './ui/app.js';

const root = document.getElementById('app');
main(root).catch((e) => {
  console.error(e);
  root.textContent = `პროგრამა ვერ ჩაირთო: ${e.message}`;
});

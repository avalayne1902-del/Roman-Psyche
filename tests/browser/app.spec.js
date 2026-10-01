import { test, expect } from '@playwright/test';

const password = 'A-long-browser-password-123!';
async function register(page) {
  const email = `browser-${crypto.randomUUID()}@example.test`;
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Konto erstellen', exact: true })
    .click();
  await page.getByLabel('Dein Name', { exact: true }).fill('Alex');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page
    .locator('#auth-form')
    .getByRole('button', { name: 'Konto erstellen' })
    .click();
  await expect(page.getByRole('heading', { name: /Alex/ })).toBeVisible();
  return email;
}

test('full reflection, explicit memory, export, re-login and account deletion', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const email = await register(page);
  await expect(page.getByRole('navigation')).toBeVisible();
  await page
    .getByRole('button', { name: 'Reflexion beginnen', exact: true })
    .click();
  const answers = [
    'Eine Nachricht blieb heute unbeantwortet.',
    'Ich dachte, meine Freundin hat wenig Zeit.',
    'Ich war unsicher und etwas enttäuscht.',
    'Ich habe das Handy weggelegt und einen Spaziergang gemacht.',
    'Danach fühlte ich mich ruhiger.',
    'Vielleicht hat sie einen vollen Arbeitstag.',
    'Morgen frage ich freundlich, ob wir am Wochenende sprechen können.',
  ];
  for (let i = 0; i < answers.length; i++) {
    await expect(
      page.getByText(`Schritt ${i + 1} von 7`, { exact: true }),
    ).toBeVisible();
    await page.locator('#reflection-input').fill(answers[i]);
    await page
      .getByRole('button', {
        name: i === answers.length - 1 ? 'Reflexion abschließen' : 'Weiter',
        exact: false,
      })
      .click();
  }
  await expect(
    page.getByRole('heading', { name: 'Ein Stück mehr Klarheit.' }),
  ).toBeVisible();
  await expect(page.getByText(answers[0], { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Im Profil merken', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Im Profil gespeichert' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Mein Profil', exact: true }).click();
  await page
    .getByLabel('Passt das zu deiner Erfahrung?')
    .selectOption('confirmed');
  await expect(page.getByLabel('Passt das zu deiner Erfahrung?')).toHaveValue(
    'confirmed',
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Daten herunterladen' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/psycheai.*\.json$/);
  await page.getByRole('button', { name: 'Entwicklung', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'So hast du dich gefühlt' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Mein Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page
    .locator('#auth-form')
    .getByRole('button', { name: 'Anmelden', exact: false })
    .click();
  await expect(page.getByRole('heading', { name: /Alex/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Alex/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mein Profil', exact: true }).click();
  await expect(page.getByLabel('Passt das zu deiner Erfahrung?')).toHaveValue(
    'confirmed',
  );
  await page.getByText('Konto und alle Daten löschen', { exact: true }).click();
  await page.getByLabel('Mit deinem Passwort bestätigen').fill(password);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
  expect(errors).toEqual([]);
});

test('crisis input stops the first step without retaining a reflection', async ({
  page,
}) => {
  await register(page);
  await page
    .getByRole('button', { name: 'Reflexion beginnen', exact: true })
    .click();
  await page.locator('#reflection-input').fill('Ich will mich umbringen');
  await page.getByRole('button', { name: 'Weiter', exact: false }).click();
  await expect(
    page.getByRole('heading', { name: 'Die Reflexion ist angehalten.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '112', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zum Überblick' }).click();
  await page.getByRole('button', { name: 'Reflexionen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '0 Reflexionen', exact: true }),
  ).toBeVisible();
});

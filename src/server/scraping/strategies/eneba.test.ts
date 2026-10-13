import { describe, expect, test } from 'vitest';
import {
  classifyEneba,
  enebaStrategy,
  formatRegion,
  parseCsv,
  parseEnebaFeed,
  parseEnebaPrice,
  withAffiliateParams,
} from './eneba';

/** Filas reales del export de Eneba (2026-10-12), recortadas. */
const CSV = [
  'id, title, original_title, description, link, image_link, availability, price, google_product_category, brand, region, condition, identifier_exists',
  'xbox-the-secret-order-shadow-breach-xbox-live-key-europe,"The Secret Order: Shadow Breach XBOX LIVE Key EUROPE","The Secret Order: Shadow Breach",,https://www.eneba.com/xbox-the-secret-order-shadow-breach-xbox-live-key-europe?currency=USD,https://products.eneba.games/products/WIhw.jpeg,"in stock","15.75 USD",1279,"Artifex Mundi",europe,new,no',
  'steam-football-manager-2021-beta-steam-key-europe,"Football Manager 2021 Beta Steam Key EUROPE","Football Manager 2021 Beta","Una descripcion, con comas\ny ""comillas""",https://www.eneba.com/steam-football-manager-2021-beta-steam-key-europe?currency=USD,https://products.eneba.games/products/fm.jpeg,"out of stock","0.00 USD",1279,SEGA,europe,new,no',
  'recharge-glo-1-ghs-ghana,"Recharge Glo - top up Ghana","Recharge Glo - top up Ghana",,https://www.eneba.com/recharge-glo-1-ghs-ghana?currency=USD,,"in stock","0.42 USD",1279,Glo,ghana,new,no',
  ',"Sin id",,,https://www.eneba.com/x,,"in stock","1.00 USD",1279,,global,new,no',
  'xbox-the-secret-order-shadow-breach-xbox-live-key-europe,"The Secret Order: Shadow Breach XBOX LIVE Key EUROPE","The Secret Order: Shadow Breach",,https://www.eneba.com/xbox-the-secret-order-shadow-breach-xbox-live-key-europe?currency=USD,https://products.eneba.games/products/WIhw.jpeg,"in stock","14.10 USD",1279,"Artifex Mundi",europe,new,no',
  '',
].join('\r\n');

describe('eneba', () => {
  test('parseCsv respeta comillas, comas y saltos de linea dentro del campo', () => {
    const rows = parseCsv('a,b\r\n"x, y","linea 1\nlinea ""2"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'linea 1\nlinea "2"'],
    ]);
  });

  test('precio y moneda', () => {
    expect(parseEnebaPrice('15.75 USD')).toEqual({ price: 15.75, currency: 'USD' });
    expect(parseEnebaPrice('1,279.50 eur')).toEqual({ price: 1279.5, currency: 'EUR' });
    // 0.00 es "sin precio", no gratis.
    expect(parseEnebaPrice('0.00 USD')).toEqual({ price: null, currency: 'USD' });
    expect(parseEnebaPrice('gratis')).toEqual({ price: null, currency: null });
  });

  test('enlace de afiliado conserva los parametros existentes', () => {
    expect(withAffiliateParams('https://www.eneba.com/x?currency=USD', { af_id: 'findyourprices' })).toBe(
      'https://www.eneba.com/x?currency=USD&af_id=findyourprices',
    );
  });

  test('region legible', () => {
    expect(formatRegion('united_states')).toBe('United States');
    expect(formatRegion('')).toBeNull();
  });

  test('clasifica por plataforma', () => {
    expect(classifyEneba('xbox-faeria-xbox-live-key-turkey', 'Faeria XBOX LIVE Key TURKEY')).toBe('xbox');
    expect(classifyEneba('psn-x', 'Playstation Network Card 200 CHF (CH) PSN Key SWITZERLAND')).toBe('playstation');
    expect(classifyEneba('nintendo-x', 'Good Job! (Nintendo Switch) eShop Key UNITED STATES')).toBe('nintendo');
    expect(classifyEneba('steam-salt', 'Salt (PC) Steam Key EUROPE')).toBe('pc-games');
    expect(classifyEneba('windows-store-injustice-2', 'Injustice 2 - Windows Store Key TURKEY')).toBe('pc-games');
    expect(classifyEneba('other-avast-vpn', 'Avast SecureLine VPN (2022) 3 Devices 1 Year Avast Key GLOBAL')).toBe('software');
    expect(classifyEneba('microsoft-office-365', 'Microsoft 365 Family 6 Device 1 Year Key GLOBAL')).toBe('software');
    expect(classifyEneba('crypto-voucher-x', 'Crypto Voucher (BTC) 890 EUR Key EUROPE')).toBe('prepaid-crypto');
    expect(classifyEneba('nike-x', 'Nike Gift Card 100 EUR Key LUXEMBOURG')).toBe('gift-cards');
    expect(classifyEneba('t-mobile-x', 'T-Mobile 50 EUR Key GERMANY')).toBe('gift-cards');
    expect(classifyEneba('recharge-glo-1-ghs-ghana', 'Recharge Glo - top up Ghana')).toBe('mobile-top-up');
    expect(classifyEneba('top-up-ea-fc-mobile', 'Top Up EA FC Mobile MEXICO')).toBe('mobile-top-up');
  });

  test('traduce el export a productos normalizados', () => {
    const feed = parseEnebaFeed(CSV, { affiliateParams: { af_id: 'findyourprices' } });

    expect(feed.rows).toBe(5);
    expect(feed.products).toHaveLength(3);
    expect(feed.skipped).toEqual([{ line: 5, reason: 'sin id' }]);
    // Id repetido: gana la ultima fila (14.10, no 15.75).
    expect(feed.duplicates).toEqual(['xbox-the-secret-order-shadow-breach-xbox-live-key-europe']);

    const [xbox, steam, recharge] = feed.products;
    expect(xbox).toMatchObject({
      external_id: 'xbox-the-secret-order-shadow-breach-xbox-live-key-europe',
      name: 'The Secret Order: Shadow Breach XBOX LIVE Key EUROPE',
      name_alias: 'The Secret Order: Shadow Breach',
      url: 'https://www.eneba.com/xbox-the-secret-order-shadow-breach-xbox-live-key-europe?currency=USD&af_id=findyourprices',
      canonical_url: 'https://www.eneba.com/xbox-the-secret-order-shadow-breach-xbox-live-key-europe',
      currency: 'USD',
      price: 14.1,
      availability: 'in_stock',
      in_stock: true,
      brand_raw: 'Artifex Mundi',
      store_category_external_id: 'xbox',
      primary_image_url: 'https://products.eneba.games/products/WIhw.jpeg',
      tags: ['Europe'],
      attributes: { region: 'Europe', google_product_category: '1279' },
    });
    expect(steam).toMatchObject({
      price: null,
      availability: 'out_of_stock',
      in_stock: false,
      description: 'Una descripcion, con comas\ny "comillas"',
      store_category_external_id: 'pc-games',
    });
    // Sin imagen, sin alias (titulo y original iguales).
    expect(recharge).toMatchObject({ primary_image_url: null, images: [], name_alias: null });

    const counts = Object.fromEntries(feed.categories.map((c) => [c.external_id, c.product_count]));
    expect(counts).toMatchObject({ xbox: 1, 'pc-games': 1, 'mobile-top-up': 1, software: 0 });
  });

  test('rechaza un CSV que no es de Eneba', () => {
    expect(() => parseEnebaFeed('sku,nombre,precio\n1,a,2')).toThrow(/faltan las columnas id, title, link/);
  });

  test('la estrategia no scrapea: explica como importar', async () => {
    await expect(enebaStrategy.run({} as never)).rejects.toThrow(/eneba:import/);
  });
});

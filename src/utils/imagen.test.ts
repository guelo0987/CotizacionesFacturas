import { describe, expect, it } from 'vitest';
import { medidasReducidas } from './imagen';

describe('medidasReducidas', () => {
  it('reduce una foto vertical de teléfono a 1600 por el lado largo', () => {
    expect(medidasReducidas(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it('reduce una foto horizontal manteniendo la proporción', () => {
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it('no agranda una foto pequeña', () => {
    expect(medidasReducidas(800, 500)).toEqual({ ancho: 800, alto: 500 });
  });

  it('acepta otro tamaño máximo', () => {
    expect(medidasReducidas(2000, 1000, 1000)).toEqual({ ancho: 1000, alto: 500 });
  });

  it('una imagen sin medidas no se puede reducir', () => {
    expect(medidasReducidas(0, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(medidasReducidas(Number.NaN, 100)).toEqual({ ancho: 0, alto: 0 });
  });
});

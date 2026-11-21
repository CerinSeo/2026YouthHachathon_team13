// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from '../src/app/App';

it('moves keyboard focus to a labeled destination search', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /어디로 가세요/ }));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '목적지 선택' }));
  expect(screen.getByRole('searchbox', { name: '목적지 검색' })).toBeDefined();
});

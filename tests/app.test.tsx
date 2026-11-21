// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from '../src/app/App';

it('moves keyboard focus to a labeled destination search', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '목적지 입력하기' }));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '출발지와 목적지' }));
  fireEvent.click(screen.getByRole('button', { name: /^목적지.*입력/ }));
  expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: '목적지 검색' }));
});

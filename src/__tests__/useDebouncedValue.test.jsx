import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { useEffect, useState } from "react";
import useDebouncedValue from "../hooks/useDebouncedValue.js";

afterEach(() => {
  cleanup();
});

test('useDebouncedValue delays updates until the timeout elapses', async (t) => {
  t.mock.timers.enable({ advance: false });

  const Harness = ({ delay, onReady }) => {
    const [value, setValue] = useState("initial");
    const debounced = useDebouncedValue(value, delay);

    useEffect(() => {
      onReady(setValue);
    }, [onReady]);

    return <span data-testid="debounced-value">{debounced}</span>;
  };

  let updateValue = () => {};
  render(
    <Harness
      delay={150}
      onReady={(setter) => {
        updateValue = setter;
      }}
    />, 
  );

  const readValue = () => screen.getByTestId('debounced-value').textContent;
  assert.equal(readValue(), 'initial');

  act(() => {
    updateValue('next');
  });

  assert.equal(readValue(), 'initial', 'value should remain unchanged before debounce interval');

  await act(async () => {
    t.mock.timers.tick(150);
  });

  assert.equal(readValue(), 'next');

  t.mock.timers.reset();
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChoiceGroup from "@/components/exam/ChoiceGroup";

afterEach(cleanup);

describe("ChoiceGroup", () => {
  it("問題文で指定された複数選択数を超える選択を防ぐ", () => {
    const onChange = vi.fn();
    const view = render(
      <ChoiceGroup
        options={["ア", "イ", "ウ", "エ"]}
        type="multiple-choice"
        selectionLimit={2}
        selectedAnswer={[0, 1]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "ウ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "ア" }));
    expect(onChange).toHaveBeenLastCalledWith([1]);

    view.rerender(
      <ChoiceGroup
        options={["ア", "イ", "ウ", "エ"]}
        type="multiple-choice"
        selectionLimit={2}
        selectedAnswer={[1]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "ウ" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ウ" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);
  });
});

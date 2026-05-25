"""Walk-Forward Validation Framework (Phase 4.7).

Provides expanding-window and rolling-window walk-forward validation over
the trade ledger. This is the institutional-standard test for temporal
robustness — if performance degrades monotonically in later folds, it is
a strong signal of in-sample overfitting.

Usage::
    from andria.backtest.walk_forward import WalkForwardValidator
    wfv = WalkForwardValidator(window_type="expanding", train_years=5, test_years=1)
    fold_results = wfv.run(ledger)
    wfv.print_summary(fold_results)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import polars as pl
from rich.console import Console
from rich.table import Table

_console = Console()

from andria.backtest.diagnostics import calculate_max_drawdown, calculate_sharpe
from andria.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class FoldResult:
    """Performance metrics for a single walk-forward fold."""

    fold: int
    train_start: int   # year
    train_end: int
    test_start: int
    test_end: int
    n_trades: int
    sharpe: float
    mean_return: float
    max_drawdown: float
    hit_rate: float    # fraction of trades with net_fwd_return > 0


class WalkForwardValidator:
    """Expanding or rolling walk-forward validation over the trade ledger.

    Args:
        window_type:  ``"expanding"`` (train grows each fold) or
                      ``"rolling"`` (fixed-size train window slides forward).
        train_years:  Initial training window size in calendar years.
        test_years:   Out-of-sample test window size in calendar years.
        min_trades:   Minimum trades per fold to report metrics (otherwise skipped).
    """

    def __init__(
        self,
        window_type: str = "expanding",
        train_years: int = 5,
        test_years: int = 1,
        min_trades: int = 10,
    ) -> None:
        if window_type not in ("expanding", "rolling"):
            raise ValueError(f"window_type must be 'expanding' or 'rolling', got {window_type!r}")
        self.window_type = window_type
        self.train_years = train_years
        self.test_years = test_years
        self.min_trades = min_trades

    def run(self, ledger: pl.DataFrame) -> list[FoldResult]:
        """Execute walk-forward validation on the trade ledger.

        Args:
            ledger: Trade ledger with ``exec_date`` and ``net_fwd_return`` columns.

        Returns:
            List of ``FoldResult`` objects, one per fold.
        """
        if "exec_date" not in ledger.columns or "net_fwd_return" not in ledger.columns:
            raise ValueError("Ledger must contain 'exec_date' and 'net_fwd_return' columns.")

        ledger = ledger.with_columns(
            pl.col("exec_date").dt.year().alias("_year")
        )
        min_year = int(ledger["_year"].min())  # type: ignore[arg-type]
        max_year = int(ledger["_year"].max())  # type: ignore[arg-type]

        fold_start = min_year + self.train_years
        results: list[FoldResult] = []
        fold_idx = 0

        test_start = fold_start
        while test_start + self.test_years - 1 <= max_year:
            test_end = test_start + self.test_years - 1

            if self.window_type == "expanding":
                train_start = min_year
                train_end = test_start - 1
            else:  # rolling
                train_start = test_start - self.train_years
                train_end = test_start - 1

            test_fold = ledger.filter(
                (pl.col("_year") >= test_start) & (pl.col("_year") <= test_end)
            )

            if test_fold.height < self.min_trades:
                logger.debug(
                    "walk_forward_fold_skipped",
                    fold=fold_idx,
                    test_years=f"{test_start}-{test_end}",
                    n_trades=test_fold.height,
                )
                test_start += self.test_years
                fold_idx += 1
                continue

            returns = test_fold["net_fwd_return"]
            hit_rate = float((returns > 0).mean())  # type: ignore[arg-type]

            result = FoldResult(
                fold=fold_idx,
                train_start=train_start,
                train_end=train_end,
                test_start=test_start,
                test_end=test_end,
                n_trades=test_fold.height,
                sharpe=calculate_sharpe(returns),
                mean_return=float(returns.mean() or 0.0),
                max_drawdown=calculate_max_drawdown(returns),
                hit_rate=hit_rate,
            )
            results.append(result)
            logger.info(
                "walk_forward_fold_complete",
                fold=fold_idx,
                test=f"{test_start}-{test_end}",
                n_trades=test_fold.height,
                sharpe=round(result.sharpe, 3),
            )

            test_start += self.test_years
            fold_idx += 1

        return results

    @staticmethod
    def print_summary(results: list[FoldResult]) -> None:
        """Display a human-readable summary of fold results."""
        if not results:
            _console.print("[yellow]No walk-forward folds completed.[/yellow]")
            return

        sharpes = [r.sharpe for r in results]
        table = Table(title="Walk-Forward Validation Summary", show_lines=False)
        table.add_column("Fold", justify="right")
        table.add_column("Train")
        table.add_column("Test")
        table.add_column("N", justify="right")
        table.add_column("Sharpe", justify="right")
        table.add_column("Mean Ret", justify="right")
        table.add_column("Hit%", justify="right")
        for r in results:
            table.add_row(
                str(r.fold),
                f"{r.train_start}–{r.train_end}",
                f"{r.test_start}–{r.test_end}",
                str(r.n_trades),
                f"{r.sharpe:.3f}",
                f"{r.mean_return:.4f}",
                f"{r.hit_rate:.1%}",
            )
        _console.print(table)
        _console.print(
            f"  Sharpe across folds: mean={np.mean(sharpes):.3f}, "
            f"std={np.std(sharpes):.3f}, "
            f"min={min(sharpes):.3f}, max={max(sharpes):.3f}"
        )

        if len(sharpes) >= 3:
            diffs = [sharpes[i + 1] - sharpes[i] for i in range(len(sharpes) - 1)]
            if all(d < 0 for d in diffs):
                _console.print(
                    "[bold yellow]  WARNING: Sharpe is monotonically decreasing across folds — "
                    "potential in-sample overfitting.[/bold yellow]"
                )

import "./styles.css";

const range = (total) => Array.from({ length: total }, (_, i) => i);

const SkeletonLine = ({ className = "" }) => (
    <div className={`skeleton skeleton-line ${className}`.trim()} />
);

const SkeletonBlock = ({ className = "" }) => (
    <div className={`skeleton ${className}`.trim()} />
);

const CardSkeleton = ({
    variant = "default",
    rows = 4,
    count,
    columns = 4,
    showToolbar = true,
    dense = false,
}) => {
    const total = count ?? rows;

    if (variant === "metrics") {
        return (
            <div
                className={`skeleton-metrics-grid skeleton-cols-${Math.min(
                    Math.max(columns, 1),
                    4,
                )}`}
            >
                {range(total || 4).map((item) => (
                    <div key={item} className="skeleton-metric-card">
                        <SkeletonBlock className="skeleton-icon" />
                        <div className="skeleton-metric-content">
                            <SkeletonLine className="short" />
                            <SkeletonLine className="value" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === "filters") {
        return (
            <div className="skeleton-card-content">
                <div className="skeleton-line-group">
                    <SkeletonLine className="medium" />
                    <SkeletonLine className="long" />
                </div>

                <div className="skeleton-filters skeleton-filters-4">
                    <SkeletonBlock className="skeleton-input" />
                    <SkeletonBlock className="skeleton-select" />
                    <SkeletonBlock className="skeleton-select" />
                    <SkeletonBlock className="skeleton-select" />
                </div>

                <SkeletonLine className="short" />
            </div>
        );
    }

    if (variant === "table") {
        return (
            <div className="skeleton-card-content">
                {showToolbar && (
                    <>
                        <div className="skeleton-toolbar">
                            <SkeletonBlock className="skeleton-chip large" />
                            <SkeletonBlock className="skeleton-chip" />
                            <SkeletonBlock className="skeleton-chip" />
                            <SkeletonBlock className="skeleton-chip" />
                        </div>

                        <div className="skeleton-filters">
                            <SkeletonBlock className="skeleton-select" />
                            <SkeletonBlock className="skeleton-select" />
                            <SkeletonBlock className="skeleton-select" />
                        </div>
                    </>
                )}

                <div className="skeleton-table">
                    <div className="skeleton-table-head">
                        {range(6).map((item) => (
                            <SkeletonBlock key={item} className="skeleton-th" />
                        ))}
                    </div>

                    {range(total || 5).map((row) => (
                        <div
                            key={row}
                            className={`skeleton-table-row ${dense ? "dense" : ""}`}
                        >
                            {range(6).map((col) => (
                                <SkeletonBlock key={col} className="skeleton-td" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (variant === "chart") {
        const heights = [82, 118, 96, 142, 108, 132, 88];

        return (
            <div className="skeleton-card-content">
                <div className="skeleton-chart">
                    {heights.map((height, item) => (
                        <div key={item} className="skeleton-chart-col">
                            <SkeletonBlock
                                className="skeleton-bar"
                                style={{ height: `${height}px` }}
                            />
                            <SkeletonBlock className="skeleton-label" />
                            <SkeletonBlock className="skeleton-small-line" />
                            <SkeletonBlock className="skeleton-small-line" />
                        </div>
                    ))}
                </div>

                <div className="skeleton-legend">
                    <SkeletonLine className="medium" />
                    <SkeletonLine className="medium" />
                    <SkeletonLine className="medium" />
                </div>
            </div>
        );
    }

    if (variant === "affinity") {
        return (
            <div className="skeleton-card-content">
                {range(total).map((item) => (
                    <div key={item} className="skeleton-affinity-item">
                        <div className="skeleton-affinity-top">
                            <div className="skeleton-affinity-relacao">
                                <SkeletonBlock className="skeleton-pill" />
                                <SkeletonBlock className="skeleton-dot" />
                                <SkeletonLine className="medium" />
                            </div>

                            <div className="skeleton-affinity-value">
                                <SkeletonBlock className="skeleton-value-box" />
                                <SkeletonLine className="short" />
                            </div>
                        </div>

                        <SkeletonBlock className="skeleton-range" />

                        <div className="skeleton-affinity-labels">
                            <SkeletonBlock className="skeleton-mini-line" />
                            <SkeletonBlock className="skeleton-mini-line" />
                            <SkeletonBlock className="skeleton-mini-line" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === "days") {
        return (
            <div className="skeleton-days-grid">
                {range(total || 3).map((item) => (
                    <div key={item} className="skeleton-day-card">
                        <div className="skeleton-day-header">
                            <SkeletonLine className="medium" />
                            <SkeletonLine className="short" />
                        </div>

                        <div className="skeleton-day-items">
                            {range(dense ? 4 : 5).map((row) => (
                                <div key={row} className="skeleton-day-row">
                                    <SkeletonLine className="long" />
                                    <SkeletonBlock className="skeleton-pill sm" />
                                    <SkeletonBlock className="skeleton-pill xs" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === "summary-cards") {
        return (
            <div className="skeleton-summary-grid">
                {range(total || 4).map((item) => (
                    <div key={item} className="skeleton-summary-card">
                        <div className="skeleton-summary-top">
                            <SkeletonLine className="medium" />
                            <SkeletonLine className="short" />
                        </div>
                        <SkeletonBlock className="skeleton-summary-bar" />
                        <SkeletonLine className="short" />
                        <div className="skeleton-summary-mini">
                            {range(7).map((bar) => (
                                <SkeletonBlock key={bar} className="skeleton-mini-bar" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === "form") {
        return (
            <div className="skeleton-card-content">
                <div className="skeleton-form-grid">
                    <div className="skeleton-line-group">
                        <SkeletonLine className="short" />
                        <SkeletonBlock className="skeleton-input" />
                    </div>

                    <div className="skeleton-line-group">
                        <SkeletonLine className="short" />
                        <SkeletonBlock className="skeleton-input" />
                    </div>
                </div>

                <div className="skeleton-line-group">
                    <SkeletonLine className="short" />
                    <SkeletonBlock className="skeleton-textarea" />
                </div>

                <div className="skeleton-line-group">
                    <SkeletonLine className="short" />
                    <SkeletonBlock className="skeleton-input" />
                </div>

                <div className="skeleton-actions-row">
                    <SkeletonBlock className="skeleton-button" />
                    <SkeletonBlock className="skeleton-button secondary" />
                </div>
            </div>
        );
    }

    if (variant === "list") {
        return (
            <div className="skeleton-card-content">
                {range(total).map((item) => (
                    <div key={item} className={`skeleton-list-item ${dense ? "dense" : ""}`}>
                        <SkeletonLine className="medium" />
                        <SkeletonLine className="long" />
                        <SkeletonLine className="short" />
                    </div>
                ))}
            </div>
        );
    }

    if (variant === "verse") {
        return (
            <div className="skeleton-card-content">
                <div className="skeleton-verse">
                    <SkeletonLine className="long" />
                    <SkeletonLine className="long" />
                    <SkeletonLine className="medium" />
                    <SkeletonLine className="short right" />
                </div>
            </div>
        );
    }

    return (
        <div className="skeleton-card-content">
            {range(total).map((item) => (
                <SkeletonLine key={item} className="long" />
            ))}
        </div>
    );
};

export default CardSkeleton;
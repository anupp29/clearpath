import { Card } from "./ui/Card";

import edaOverview from "../assets/eda_overview.png";
import impactQuantification from "../assets/impact_quantification.png";
import shapImportance from "../assets/shap_importance.png";
import calibrationAndFolds from "../assets/calibration_and_folds.png";
import officerRisk from "../assets/officer_risk.png";
import outlierAnalysis from "../assets/outlier_analysis.png";
import signalEndAddress from "../assets/signal_end_address.png";

export function About() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-cp-navy">
          About
        </h2>
        <p className="mt-1 text-sm text-cp-muted">
          ClearPath AI - BTP Road Closure Risk Engine
        </p>
      </div>

      <Card className="max-w-none overflow-x-auto p-6 space-y-6 text-cp-navy">
        <section>
          <h3 className="text-lg font-semibold mb-2">
            Flipkart - Gridlock Hackathon 2.0
          </h3>

          <p className="mb-4">
            <strong>Event-Driven Congestion (Planned & Unplanned)</strong>
          </p>

          <h4 className="font-semibold mt-4 mb-2">
            Operational Challenge
          </h4>

          <p className="mb-4">
            Political rallies, festivals, sports events, construction
            activities, and sudden gatherings create localized traffic
            breakdowns.
          </p>

          <h4 className="font-semibold mt-4 mb-2">
            Why It's Hard Today
          </h4>

          <ul className="list-disc pl-6 mb-4 space-y-1">
            <li>Event impact is not quantified in advance.</li>
            <li>Resource deployment is experience-driven.</li>
            <li>No post-event learning system.</li>
          </ul>

          <h4 className="font-semibold mt-4 mb-2">
            Problem Statement Direction
          </h4>

          <p className="mb-4">
            How can historical and real-time data be used to forecast
            event-related traffic impact and recommend optimal manpower,
            barricading, and diversion plans?
          </p>
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">
            Model Outputs & Inference
          </h3>

          <div className="space-y-8">
            {/* EDA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={edaOverview}
                  alt="EDA Overview"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Exploratory Data Analysis
                </h4>

                <p className="text-sm text-gray-700">
                  Comprehensive overview of ASTraM event logs, revealing
                  geographical hotspots and temporal distribution of events
                  across Bengaluru.
                </p>
              </div>
            </div>

            {/* Impact Quantification */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={impactQuantification}
                  alt="Impact Quantification"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Impact Quantification
                </h4>

                <p className="text-sm text-gray-700">
                  Detailed analysis of traffic disruption severity based on
                  duration and closure patterns, categorizing events into
                  actionable risk tiers.
                </p>
              </div>
            </div>

            {/* SHAP */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={shapImportance}
                  alt="SHAP Importance"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Feature Importance (SHAP)
                </h4>

                <p className="text-sm text-gray-700">
                  Global and local feature contributions from the ensemble
                  model, highlighting primary drivers of road closure risk
                  such as event type, duration, and specific corridors.
                </p>
              </div>
            </div>

            {/* Calibration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={calibrationAndFolds}
                  alt="Calibration and Folds"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Model Calibration & Cross-Validation
                </h4>

                <p className="text-sm text-gray-700">
                  Reliability diagrams and out-of-fold metrics demonstrating
                  robust model performance and calibrated probability estimates
                  for operational deployment.
                </p>
              </div>
            </div>

            {/* Officer Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={officerRisk}
                  alt="Officer Risk"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Officer Risk Profiling
                </h4>

                <p className="text-sm text-gray-700">
                  Aggregated historical risk exposure to guide
                  experience-driven resource deployment and manpower planning
                  for complex events.
                </p>
              </div>
            </div>

            {/* Outlier Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={outlierAnalysis}
                  alt="Outlier Analysis"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Outlier Analysis
                </h4>

                <p className="text-sm text-gray-700">
                  Identification of extreme events and anomalies, crucial for
                  designing robust diversion plans and understanding
                  unprecedented congestion patterns.
                </p>
              </div>
            </div>

            {/* Signal End Address */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="w-full">
                <img
                  src={signalEndAddress}
                  alt="Signal End Address"
                  className="rounded shadow-sm w-full h-auto object-contain border border-gray-200"
                />
              </div>

              <div>
                <h4 className="font-semibold text-md mb-2">
                  Signal & Address Correlation
                </h4>

                <p className="text-sm text-gray-700">
                  Spatial correlation of events near critical traffic signals
                  and key addresses to recommend optimal barricading strategies.
                </p>
              </div>
            </div>
          </div>
        </section>
      </Card>
    </div>
  );
}

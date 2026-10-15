# Validity of the analytical methods

This page sets out how far ErgoCapture's results can be trusted, and on what evidence. It separates four questions that are often blurred together:

1. **Are the methods themselves valid?** Do RULA, REBA, OWAS, the NIOSH equation and the others reflect real musculoskeletal risk, and do different assessors agree when using them?
2. **Are the measurements valid?** Do joint angles estimated from ordinary video match those from laboratory motion capture?
3. **Is the implementation correct?** Does ErgoCapture compute each method the way it was published?
4. **Is the combination validated?** Do ErgoCapture's automatic scores agree with expert assessments of the same work?

> **Bottom line.** The methods are established screening tools with moderate reliability and limited, mostly cross-sectional evidence of predictive validity. Published studies show that camera-based angle measurement can support automated RULA/REBA with substantial agreement to experts under good conditions, but with clear weaknesses for wrists, neck and trunk rotation. ErgoCapture's own calculations are verified against synthetic ground truth, but **ErgoCapture as a whole has not yet been validated against motion capture or expert raters.** Use its results for screening, prioritising and documenting jobs, with review by a qualified ergonomist, not as a stand-alone basis for decisions about individual workers.

## 1. Evidence for the methods

All of these are observational methods designed for a trained human observer. ErgoCapture automates the observer, so the evidence below describes the ceiling: an automated version cannot be more valid than the method itself.

### RULA (Rapid Upper Limb Assessment)

- **Purpose.** A survey method for upper-limb work-related disorders that scores neck, trunk, upper limbs, muscle use and load into four action levels (McAtamney & Corlett, 1993).
- **Reliability.** Moderate to good between and within raters in a study of six trained raters scoring video; intra-rater reliability exceeded inter-rater reliability (Dockrell et al., 2012).
- **Validity.** A literature review ranked RULA's risk levels as more strongly associated with discomfort and musculoskeletal disorders than those of OWAS and REBA (Kee, 2022).
- **Known behaviour.** For the same 301 postures RULA placed 56 % at action level 3–4, versus about 21 % for OWAS and REBA; agreement was 29 % with OWAS and 48 % with REBA (Kee & Karwowski, 2007). Legs have only two classes.
- **For ErgoCapture.** RULA tends to rate higher than REBA and OWAS; differences between the methods in a report are expected and do not indicate an error.

### REBA (Rapid Entire Body Assessment)

- **Purpose.** Whole-body postural risk for unpredictable tasks; developed from over 600 coded postures. The authors described its initial inter-observer reliability as promising and its validity as still to be established (Hignett & McAtamney, 2000).
- **Reliability.** Intra-rater ICC 0.925 for raw scores; inter-rater agreement on risk categories Fleiss κ 0.54 (moderate) with eight observers (Schwartz et al., 2019). Rater experience matters: intra-rater ICC 0.89 for an expert vs 0.51 for a novice (Balogh et al., 2025).
- **Known behaviour.** Tends to give lower risk levels than RULA for the same postures (Kee & Karwowski, 2007).

### OWAS (Ovako Working Posture Analysis System)

- **Purpose.** Classifies whole-body posture codes into four action categories; criteria based on worker and expert judgements of discomfort (Karhu et al., 1977).
- **Evidence.** A review of 166 records found OWAS almost always flagged risk and recommended combining it with other methods (Gómez-Galán et al., 2017). It has no neck, forearm or wrist detail.
- **For ErgoCapture.** OWAS is reported per posture and as the time share of each action category; the time-based OWAS action charts are not implemented (see [Methods](methods.md#owas-karhu-et-al-1977)).

### Revised NIOSH Lifting Equation

- **Purpose.** Recommended weight limit and Lifting Index (LI) for two-handed lifting, derived from biomechanical, physiological and psychophysical criteria. Its authors stated that it had not been fully validated (Waters et al., 1993).
- **Predictive evidence.** Cross-sectionally, low back pain odds rose with LI between 1 and 3 (OR 2.45 for 2 < LI ≤ 3) but not further above 3 (Waters et al., 1999). In pooled data from 677 workers in 125 jobs: OR 1.81 for 1 < LI ≤ 2 and 2.26 for 2 < LI ≤ 3; LI > 3 was not significant; the authors called for longitudinal studies (Waters et al., 2011).
- **Scope limits.** The equation does not apply to one-handed, seated or kneeling lifting, restricted spaces, unstable loads, or high-speed lifting (NIOSH Applications Manual, 1994). ErgoCapture does not check these conditions automatically.
- **For ErgoCapture.** Load weight, coupling and duration are entered by the user. H, V and A are measured from the skeleton and depend on correct scale (enter the worker's height).

### Strain Index (SI) and Revised Strain Index

- **Purpose.** Risk of distal upper-limb disorders from six multipliers (Moore & Garg, 1995). ErgoCapture implements the **1995 SI**.
- **Predictive evidence.** Retrospectively, the SI hazard classification separated jobs with and without distal upper-limb disorders well (OR 108 in 56 jobs, sensitivity, specificity and predictive values about 0.90; Moore et al., 2001; OR 107 in 28 jobs; Rucker & Moore, 2002). Prospectively, in 536 workers over six years, SI predicted carpal tunnel syndrome with adjusted hazard ratios up to 5.3 (Garg et al., 2012).
- **Reliability.** Inter-rater ICC 0.59 with seven raters (Paulsen et al., 2015).
- **Revised SI.** Uses continuous multipliers; agrees with the 1995 SI at the extremes but differs in between, and was evaluated by simulation rather than against health outcomes (Garg et al., 2016/2017).
- **For ErgoCapture.** Exertion intensity and speed are rated by the user; exertion duration and wrist posture are estimated from posture, not force, so SI here is indicative.

### OCRA

- **Purpose.** Exposure to repetitive upper-limb movements (Occhipinti, 1998); the preferred method in ISO 11228-3:2007. Its risk zones were set by regressing OCRA scores on the prevalence of upper-limb disorders across 23 worker groups, i.e. cross-sectional data (Occhipinti & Colombini, 2007).
- **Reliability.** OCRA checklist inter-rater ICC 0.80 with seven raters, though it needs more training than the SI (Paulsen et al., 2015).
- **Debate.** The scientific basis of ISO's biomechanical standards, including the choice of OCRA, has been questioned (Armstrong et al., 2018) and defended by OCRA's authors (Colombini & Occhipinti, 2018).
- **For ErgoCapture.** Only a simplified **screening version** of the checklist is implemented, with technical actions estimated from movement peaks. It is not the OCRA index of ISO 11228-3.

### ISO 11226 and EN 1005-4

- **Purpose.** ISO 11226 evaluates existing static postures (angles and holding times); EN 1005-4 is a design-stage standard for machinery. Their backgrounds and differences are described by Delleman & Dul (2007). Recommended maximum holding times for standing postures were published by Miedema et al. (1997); we have not confirmed whether the standards' curves derive from that work.
- **For ErgoCapture.** The holding-time limits are **linear approximations** written without access to the standards' text. Treat these verdicts as indicative and check them against the standards.

### What reviews conclude

A systematic evaluation of 30 observational methods found validity moderate to good against video and direct measurements, best for large postures; **wrist and hand postures and trunk rotation were the most difficult to assess**; repeatability was mostly moderate to good; no single method was best overall (Takala et al., 2010). Simple observational methods offer the best balance for practitioners, while direct measurement is more precise (David, 2005).

## 2. Evidence for camera-based measurement

- **Overall accuracy.** A systematic review of 20 studies reported mean joint-angle error of 2.3° ± 4.0° and ICC above 0.80 for markerless systems, and accuracy up to 89 % (κ 0.71) for predicting RULA/REBA (Scataglini et al., 2025). Results depend strongly on task and setting.
- **Occupational lifting.** Against a Vicon system, MediaPipe and OpenCap showed sagittal-plane RMSE of 9.9–31.2°, larger errors in the frontal and transverse planes, 15–30 % larger errors for asymmetric tasks, and reduced validity for trunk rotation and walking (Zhang et al., 2026). MediaPipe did better for trunk and proximal joints.
- **MediaPipe limb angles.** Comparable to or better than Kinect v2 against Qualisys, within the range of goniometer error (Lafayette et al., 2022).
- **Automated RULA/REBA.** Kinect v2 RULA agreed with optical motion capture at 0.97 (κ 0.87) and with an expert at 0.96 (κ 0.84) (Manghisi et al., 2017). Occlusion correction improved Kinect RULA in a cluttered workplace (Plantard et al., 2017). OpenPose-based RULA/REBA held up across occlusion and camera-angle conditions where Kinect degraded (Kim et al., 2021). Video-based RULA reached κ above 0.6 against seven specialists in most real-world tests (Massiris Fernández et al., 2020). In a commercial AI REBA tool, agreement with an expert was lowest for **neck, wrist and lower arm** and highest for trunk, legs and upper arm (Balogh et al., 2025).
- **Viewpoint.** A single frontal camera cannot reliably reconstruct some angles such as neck flexion; a side camera was needed (Coruzzolo et al., 2022). Out-of-plane errors, especially trunk rotation, are larger (Zhang et al., 2026).
- **ErgoCapture's engines.** RTMW reaches 70.2 mAP on the COCO-WholeBody benchmark (Jiang et al., 2024), and rtmlib-based 2D estimation ranked among the better frameworks for joint angles in a 16-framework comparison (Kahl et al., 2026). SAM 3D Body reports state-of-the-art mesh-recovery benchmarks (Yang et al., 2026). **We found no ergonomics validation of RTMW, InstantHMR or SAM 3D Body.**

**What this means for ErgoCapture.** The literature supports the approach for screening, and it agrees with ErgoCapture's design choices: a side view for single cameras, multiple cameras where possible, lower confidence for wrists, neck and twist, and the score-stability confidence model (scores near a threshold are the ones most affected by angle error). It does not validate ErgoCapture's specific combination of models, mappings and thresholds.

## 3. Verification of the implementation

What has been checked about ErgoCapture's own calculations, by automated tests that run on every change (`npm test`, 64 tests; server: 6 tests).

| What | How | Result |
|---|---|---|
| Joint-angle geometry | Synthetic skeletons with known angles (forward kinematics), camera views of 0°, 45°, 90° and −60° | Trunk, neck, upper arm, elbow, wrist and knee angles recovered within 1° |
| RTMW mapping (pixels + depth → metric 3D) | Same synthetic postures expressed in RTMW's native format at 0°, 60°, 90° views | Metres-per-pixel within ±10 %; angles within 4–5° |
| SAM 3D Body / InstantHMR mapping | Synthetic postures in MHR-70 format | Angles within 1° |
| Scoring tables | Spot checks of RULA, REBA, OWAS table cells; independent cell-by-cell check against published sources | See below |
| NIOSH equation | Textbook case (H 40, V 30, D 60, A 0, 1 lift/min, ≤ 2 h, fair) | RWL 9.3 kg as expected; frequency multiplier interpolation and limits checked |
| Posture scores | Neutral standing, deep stoop, overhead work on synthetic skeletons | Expected scores (e.g. neutral RULA 2 / REBA 1; stoop REBA 7) |
| Session pipeline | 60 s synthetic pick-and-place job | Lifts detected, repetition detected, activities segmented, stature scaling, multi-view fusion increases confidence |
| Compressed RTMW model | Original vs float16-weight model in the browser runtime on real images | Ergonomically relevant keypoints within 0.6 px and 0.4 cm |
| AI narrative guards | Unit tests | Sentences with invented numbers or reassuring claims contradicting a medium+ risk are removed |

**Scoring tables.** _Verification against published sources in progress; this section will list the result._

**Not verified.**

- No comparison of ErgoCapture's angles with motion capture or inertial sensors.
- No comparison of ErgoCapture's scores with expert raters.
- The confidence model's parameters (assumed angle errors, engine reliability mappings) are engineering assumptions, not calibrated on reference data.
- The ISO 11226 / EN 1005-4 holding-time curves and the condensed OCRA checklist mappings have not been checked against the standards' text.
- The AI narrative (beta) has only been tested with the small fallback writer model on a computer without a graphics processor.
- One observation from testing: on the same single photo of a walking person, MediaPipe gave RULA 6 / REBA 7 while RTMW gave RULA 3 / REBA 1, with MediaPipe reporting a raised arm and neck extension that were not present. The app warns against MediaPipe for photo assessments.

## 4. Sources of error and how ErgoCapture handles them

| Source | Effect | Mitigation in ErgoCapture |
|---|---|---|
| Single camera, depth ambiguity | Forward bending from the front and twisting are uncertain | View-angle-dependent reliability; side-view guidance; multi-camera fusion |
| Occlusion, partial view | Missing or guessed joints | Keypoint visibility lowers confidence; short gaps interpolated, long gaps excluded; coverage reported |
| Coarse hand landmarks (MediaPipe) | Wrist angles unreliable | Wrist reliability × 0.6; RTMW and mesh engines give finger joints |
| Forearm rotation | Not observable from keypoints | RULA wrist twist fixed at 1 (mid-range), stated in reports |
| Camera tilt | Vertical misjudged | Neutral-posture calibration on the Live page |
| Unknown body scale | Distances wrong (NIOSH H/V, reach) and RTMW depth scale affected | Enter the worker's height |
| Unobservable factors | Load, grip, effort, recovery cannot be seen | Entered in task settings and shown in reports |
| Scores near a threshold | Small angle errors change the action level | Monte Carlo score stability in every confidence value |
| Wrong person in multi-person scenes | Wrong worker assessed | Tracker with person selection (video); largest person (photos) |
| Activity rules and heuristics (seated, load in hands, static, repetitive) | May misclassify unusual tasks | Settings can override seated and load; the timeline shows the flags |

## 5. Appropriate use

**Supported, with review by a qualified person:**

- Screening and ranking jobs or tasks by postural risk.
- Finding the moments and body parts that drive the risk, and documenting them with images and timelines.
- Comparing before and after a workplace change, recorded with the same camera set-up.
- Providing quantitative input (angles, time in posture, repetition) to an ergonomist's assessment.

**Not supported:**

- Decisions about an individual worker's fitness, health or employment.
- Legal or compliance determinations based on the ErgoCapture output alone.
- Treating a single score as exact: always read it with its confidence and, where low, check the video.
- The NIOSH equation, Strain Index or OCRA outside their stated conditions.

## 6. Validation plan

A study that would establish ErgoCapture's validity directly:

1. **Reference systems.** Optical motion capture (e.g. Vicon, Qualisys) for angles in a laboratory mock-up of real tasks, and inertial sensors (e.g. Xsens) in the field; two independent certified ergonomists scoring RULA, REBA and OWAS from the same video.
2. **Tasks.** Lifting and lowering at different heights and asymmetry, overhead work, reaching, seated assembly, repetitive hand work, kneeling; at least 15–20 participants of varied stature and clothing.
3. **Camera conditions, tested separately.** One phone at 0°, 45° and 90° to the worker; two phones; four phones; with and without neutral calibration; RTMW vs MediaPipe vs SAM 3D Body.
4. **Outcomes.**
   - Angles: RMSE, bias and limits of agreement (Bland–Altman) per joint and plane; ICC.
   - Scores: weighted κ and percentage exact / within-one agreement for RULA, REBA, OWAS against each ergonomist and against scores computed from motion capture; the ergonomists' own inter-rater agreement as the benchmark.
   - Session methods: LI, SI and OCRA against expert assessments of the same jobs.
   - Confidence calibration: whether "high confidence" scores agree with the reference more often than "medium" and "low", and re-fitting the confidence model's error assumptions to the measured errors.
5. **Publication.** Report which camera set-up is adequate for which method, and update this page and the in-app confidence model accordingly.

The per-frame CSV export (every angle with its reliability, every score with its confidence) is designed to feed such a study.

## References

Methods

- Balogh I, et al. (2025). Reliability and agreement during the Rapid Entire Body Assessment. *PLOS ONE* 20(5):e0323262. https://doi.org/10.1371/journal.pone.0323262
- Colombini D, Occhipinti E (2018). Scientific basis of the OCRA method for risk assessment of biomechanical overload of upper limb. *Scand J Work Environ Health* 44(4):436–438. https://doi.org/10.5271/sjweh.3746
- Armstrong TJ, et al. (2018). Scientific basis of ISO standards on biomechanical risk factors. *Scand J Work Environ Health* 44(3):323–329. https://doi.org/10.5271/sjweh.3718
- David GC (2005). Ergonomic methods for assessing exposure to risk factors for work-related musculoskeletal disorders. *Occupational Medicine* 55(3):190–199. https://doi.org/10.1093/occmed/kqi082
- Delleman NJ, Dul J (2007). International standards on working postures and movements ISO 11226 and EN 1005-4. *Ergonomics* 50(11):1809–1819. https://doi.org/10.1080/00140130701674430
- Dockrell S, et al. (2012). An investigation of the reliability of Rapid Upper Limb Assessment (RULA) as a method of assessment of children's computing posture. *Applied Ergonomics* 43(3):632–636. https://doi.org/10.1016/j.apergo.2011.09.009
- Garg A, et al. (2012). The Strain Index (SI) and Threshold Limit Value (TLV) for Hand Activity Level: risk of carpal tunnel syndrome in a prospective cohort. *Ergonomics* 55(4):396–414. https://doi.org/10.1080/00140139.2011.644328
- Garg A, Moore JS, Kapellusch JM (2017; online 2016). The Revised Strain Index: an improved upper extremity exposure assessment model. *Ergonomics* 60(7):912–922. https://doi.org/10.1080/00140139.2016.1237678
- Gómez-Galán M, et al. (2017). Musculoskeletal disorders: OWAS review. *Industrial Health* 55(4):314–337. https://doi.org/10.2486/indhealth.2016-0191
- Hignett S, McAtamney L (2000). Rapid Entire Body Assessment (REBA). *Applied Ergonomics* 31(2):201–205. https://doi.org/10.1016/S0003-6870(99)00039-3
- Karhu O, Kansi P, Kuorinka I (1977). Correcting working postures in industry: a practical method for analysis. *Applied Ergonomics* 8(4):199–201. https://doi.org/10.1016/0003-6870(77)90164-8
- Kee D (2022). Systematic comparison of OWAS, RULA, and REBA based on a literature review. *IJERPH* 19(1):595. https://doi.org/10.3390/ijerph19010595
- Kee D, Karwowski W (2007). A comparison of three observational techniques for assessing postural loads in industry. *Int J Occup Saf Ergon* 13(1):3–14. https://doi.org/10.1080/10803548.2007.11076704
- McAtamney L, Corlett EN (1993). RULA: a survey method for the investigation of work-related upper limb disorders. *Applied Ergonomics* 24(2):91–99. https://doi.org/10.1016/0003-6870(93)90080-S
- Miedema MC, Douwes M, Dul J (1997). Recommended maximum holding times for prevention of discomfort of static standing postures. *Int J Ind Ergon* 19(1). https://doi.org/10.1016/0169-8141(95)00037-2
- Moore JS, Garg A (1995). The Strain Index: a proposed method to analyze jobs for risk of distal upper extremity disorders. *AIHA Journal* 56(5):443–458. https://doi.org/10.1080/15428119591016863
- Moore JS, Rucker NP, Knox K (2001). Validity of generic risk factors and the Strain Index for predicting nontraumatic distal upper extremity morbidity. *AIHAJ* 62(2):229–235. https://doi.org/10.1080/15298660108984626
- NIOSH (1994). Applications manual for the revised NIOSH lifting equation. Publication 94-110. https://doi.org/10.26616/NIOSHPUB94110
- Occhipinti E (1998). OCRA: a concise index for the assessment of exposure to repetitive movements of the upper limbs. *Ergonomics* 41(9). https://doi.org/10.1080/001401398186315
- Occhipinti E, Colombini D (2007). Updating reference values and predictive models of the OCRA method in the risk assessment of work-related musculoskeletal disorders of the upper limbs. *Ergonomics* 50(11):1727–1739. https://doi.org/10.1080/00140130701674331
- Paulsen R, et al. (2015). The inter-rater reliability of Strain Index and OCRA Checklist task assessments in cheese processing. *Applied Ergonomics* 51:199–204. https://doi.org/10.1016/j.apergo.2015.04.019
- Rucker N, Moore JS (2002). Predictive validity of the Strain Index in manufacturing facilities. *Appl Occup Environ Hyg* 17(1):63–73. https://doi.org/10.1080/104732202753306177
- Schwartz AH, Albin TJ, Gerberich SG (2019). Intra-rater and inter-rater reliability of the rapid entire body assessment (REBA) tool. *Int J Ind Ergon* 71:111–116. https://stacks.cdc.gov/view/cdc/222572
- Takala EP, et al. (2010; online 2009). Systematic evaluation of observational methods assessing biomechanical exposures at work. *Scand J Work Environ Health* 36(1):3–24. https://doi.org/10.5271/sjweh.2876
- Waters TR, et al. (1993). Revised NIOSH equation for the design and evaluation of manual lifting tasks. *Ergonomics* 36(7):749–776. https://doi.org/10.1080/00140139308967940
- Waters TR, et al. (1999). Evaluation of the Revised NIOSH Lifting Equation: a cross-sectional epidemiologic study. *Spine* 24(4):386–394. https://doi.org/10.1097/00007632-199902150-00019
- Waters TR, et al. (2011). Efficacy of the Revised NIOSH Lifting Equation to predict risk of low back pain due to manual lifting. *J Occup Environ Med* 53(9):1061–1067. https://doi.org/10.1097/JOM.0b013e31822cfe5e
- ISO 11226:2000; ISO 11228-3:2007; EN 1005-4:2005+A1:2008.

Camera-based measurement

- Coruzzolo AM, et al. (2022). RGB-based RULA assessment. *AHFE Physical Ergonomics and Human Factors* 63:54–61. https://openaccess.cms-conferences.org/publications/book/978-1-958651-39-1/article/978-1-958651-39-1_7
- Jiang T, et al. (2023). RTMPose: real-time multi-person pose estimation based on MMPose. arXiv:2303.07399. https://arxiv.org/abs/2303.07399
- Jiang T, Xie X, Li Y (2024). RTMW: real-time multi-person 2D and 3D whole-body pose estimation. arXiv:2407.08634. https://arxiv.org/abs/2407.08634
- Kahl et al. (2026). A comparative assessment of accuracy in video-based monocular human pose estimation. *IEEE TPAMI* 48(7):8470–8484. https://doi.org/10.1109/TPAMI.2026.3672463
- Kim W, et al. (2021). Ergonomic postural assessment using a new open-source human pose estimation technology (OpenPose). *Int J Ind Ergon* 84:103164. https://doi.org/10.1016/j.ergon.2021.103164
- Lafayette TBG, et al. (2022). Validation of angle estimation based on body tracking data from RGB-D and RGB cameras for biomechanical assessment. *Sensors* 23(1):3. https://doi.org/10.3390/s23010003
- Manghisi VM, et al. (2017). Real time RULA assessment using Kinect v2 sensor. *Applied Ergonomics* 65:481–491. https://doi.org/10.1016/j.apergo.2017.02.015
- Massiris Fernández M, et al. (2020). Ergonomic risk assessment based on computer vision and machine learning. *Computers & Industrial Engineering* 149:106816. https://doi.org/10.1016/j.cie.2020.106816
- Plantard P, et al. (2017). Validation of an ergonomic assessment method using Kinect data in real workplace conditions. *Applied Ergonomics* 65:562–569. https://doi.org/10.1016/j.apergo.2016.10.015
- Scataglini S, et al. (2025). A systematic review of the accuracy, validity, and reliability of markerless motion capture. *Sensors* 25(17):5513. https://doi.org/10.3390/s25175513
- Yang et al. (2026). SAM 3D Body: robust full-body human mesh recovery. arXiv:2602.15989. https://arxiv.org/abs/2602.15989
- Zhang et al. (2026). Concurrent validity of markerless motion capture for occupational lifting. *Applied Ergonomics* 138:104866. https://doi.org/10.1016/j.apergo.2026.104866

Each DOI above was checked against Crossref. Some findings were taken from abstracts rather than full texts; check the original papers before citing them in a formal report.

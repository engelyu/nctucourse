import React, { useEffect } from "react";
import { Container, Typography, Link } from "@material-ui/core";
import useAxios from 'axios-hooks'
import { useSnackbar } from "notistack";
import { semesterToText } from "../../Util/dataUtil/semester";

const HistoryLink = (props) => (
  <div style={{ marginTop: 5 }}>
    <Link
      style={{ textDecoration: "none" }}
      variant="body2"
      href={props.href}
    >
      {props.text}
    </Link>

  </div>
)

const History = () => {
  let url = `/api/simulation/semesters/`
  const [{ data, loading, error }] = useAxios(url)
  const { enqueueSnackbar } = useSnackbar();
  useEffect(() => {
    if (!loading && error) {
      enqueueSnackbar("載入失敗!(網路錯誤)", { variant: "error" });
    }
  }, [loading, error, enqueueSnackbar]);


  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        歷年課程
      </Typography>
      {
        data && (
          data.map(sem => (
            <HistoryLink key={sem} text={semesterToText(sem)} href={`/simulation?sem=${sem}`} />
          ))
        )
      }
    </Container>
  );
};

export default History;
